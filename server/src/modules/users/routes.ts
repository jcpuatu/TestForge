import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';
import { generateApiKey, hashToken } from '../../lib/tokens';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { createApiKeySchema, createUserSchema, updateUserSchema } from './schema';

export const usersRouter = Router();

function toPublicUser(user: { id: string; email: string; name: string; role: string; isActive: boolean; createdAt: Date }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive, createdAt: user.createdAt };
}

usersRouter.use(requireAuth);

// Any authenticated user can see the active-user directory (id/name/role only) —
// needed to populate "assign to" pickers without exposing email/creation-date
// like the full admin listing below does.
usersRouter.get(
  '/directory',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  }),
);

usersRouter.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ users: users.map(toPublicUser) });
  }),
);

usersRouter.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new BadRequestError('A user with that email already exists');
    }
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, role: body.role, passwordHash },
    });
    res.status(201).json({ user: toPublicUser(user) });
  }),
);

usersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new ForbiddenError();
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new NotFoundError('User');
    res.json({ user: toPublicUser(user) });
  }),
);

usersRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const body = updateUserSchema.parse(req.body);
    const data: Record<string, unknown> = { ...body };
    delete data.password;
    if (body.password) {
      data.passwordHash = await hashPassword(body.password);
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ user: toPublicUser(user) });
  }),
);

usersRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).send();
  }),
);

usersRouter.get(
  '/:id/api-keys',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new ForbiddenError();
    }
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      apiKeys: keys.map((k) => ({
        id: k.id,
        label: k.label,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
      })),
    });
  }),
);

usersRouter.post(
  '/:id/api-keys',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new ForbiddenError();
    }
    const body = createApiKeySchema.parse(req.body);
    const { raw, prefix } = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        userId: req.params.id,
        label: body.label,
        keyPrefix: prefix,
        keyHash: hashToken(raw),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    // Raw key is only ever shown once, at creation time.
    res.status(201).json({ apiKey: { id: apiKey.id, label: apiKey.label, key: raw, keyPrefix: prefix } });
  }),
);

usersRouter.delete(
  '/:id/api-keys/:keyId',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new ForbiddenError();
    }
    await prisma.apiKey.update({ where: { id: req.params.keyId }, data: { revokedAt: new Date() } });
    res.status(204).send();
  }),
);
