import { Router } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { deliverTestPing } from '../../lib/webhook-dispatcher';
import { assertPublicHttpUrl } from '../../lib/urlSafety';
import { createWebhookSchema, updateWebhookSchema } from './schema';

const MANAGE_ROLES = ['ADMIN', 'LEAD'] as const;

function toPublicWebhook(webhook: { id: string; projectId: string | null; url: string; event: string; isActive: boolean; createdAt: Date }) {
  // secret is intentionally omitted — only shown once, at creation.
  return webhook;
}

// Mounted at /api/v1/projects/:projectId/webhooks
export const webhooksNestedRouter = Router({ mergeParams: true });
webhooksNestedRouter.use(requireAuth);

webhooksNestedRouter.get(
  '/',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const webhooks = await prisma.webhook.findMany({ where: { projectId: req.params.projectId }, orderBy: { createdAt: 'desc' } });
    res.json({ webhooks: webhooks.map(toPublicWebhook) });
  }),
);

webhooksNestedRouter.post(
  '/',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createWebhookSchema.parse(req.body);
    await assertPublicHttpUrl(body.url);
    const secret = crypto.randomBytes(24).toString('hex');
    const webhook = await prisma.webhook.create({
      data: { projectId: req.params.projectId, url: body.url, event: body.event, secret },
    });
    // Raw secret is only ever shown once, at creation time — used to verify the X-TestForge-Signature header.
    res.status(201).json({ webhook: { ...toPublicWebhook(webhook), secret } });
  }),
);

// Mounted at /api/v1/webhooks
export const webhooksRouter = Router();
webhooksRouter.use(requireAuth);

webhooksRouter.patch(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = updateWebhookSchema.parse(req.body);
    if (body.url) await assertPublicHttpUrl(body.url);
    const webhook = await prisma.webhook.update({ where: { id: req.params.id }, data: body });
    res.json({ webhook: toPublicWebhook(webhook) });
  }),
);

webhooksRouter.delete(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.webhook.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

webhooksRouter.post(
  '/:id/test',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.id } });
    if (!webhook) throw new NotFoundError('Webhook');
    await deliverTestPing(webhook, req.user!.id);
    res.status(202).json({ status: 'dispatched' });
  }),
);

webhooksRouter.get(
  '/:id/deliveries',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    res.json({ deliveries });
  }),
);
