import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { createLabelSchema, updateLabelSchema } from './schema';
import { logAudit } from '../../lib/audit';

const MANAGE_ROLES = ['ADMIN', 'LEAD'] as const;

async function assertNameAvailable(projectId: string, name: string, excludeId?: string) {
  const existing = await prisma.label.findMany({ where: { projectId } });
  const clash = existing.find((l) => l.id !== excludeId && l.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new BadRequestError(`A label named "${clash.name}" already exists in this project`);
}

// Mounted at /api/v1/projects/:projectId/labels
export const labelsNestedRouter = Router({ mergeParams: true });
labelsNestedRouter.use(requireAuth);

labelsNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const labels = await prisma.label.findMany({ where: { projectId: req.params.projectId }, orderBy: { name: 'asc' } });
    res.json({ labels });
  }),
);

labelsNestedRouter.post(
  '/',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createLabelSchema.parse(req.body);
    await assertNameAvailable(req.params.projectId, body.name);
    const label = await prisma.label.create({ data: { projectId: req.params.projectId, name: body.name } });
    res.status(201).json({ label });
  }),
);

// Mounted at /api/v1/labels
export const labelsRouter = Router();
labelsRouter.use(requireAuth);

labelsRouter.patch(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.label.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Label');
    const body = updateLabelSchema.parse(req.body);
    await assertNameAvailable(existing.projectId, body.name, existing.id);
    // Renaming is all a rename needs to do — every TestCaseLabel join row still points at
    // this same Label id, so the new name is picked up everywhere automatically.
    const label = await prisma.label.update({ where: { id: req.params.id }, data: { name: body.name } });
    await logAudit({
      projectId: existing.projectId,
      actorId: req.user!.id,
      action: 'LABEL_RENAMED',
      entityType: 'Label',
      entityId: label.id,
      summary: `Renamed label "${existing.name}" to "${label.name}"`,
    });
    res.json({ label });
  }),
);

labelsRouter.delete(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.label.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Label');
    // Cascades to TestCaseLabel automatically (onDelete: Cascade), removing the label from
    // every case that had it — matches TestRail's documented delete-label behavior.
    await prisma.label.delete({ where: { id: req.params.id } });
    await logAudit({
      projectId: existing.projectId,
      actorId: req.user!.id,
      action: 'LABEL_DELETED',
      entityType: 'Label',
      entityId: existing.id,
      summary: `Deleted label "${existing.name}"`,
    });
    res.status(204).send();
  }),
);
