import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { createMilestoneSchema, updateMilestoneSchema } from './schema';

const MANAGE_ROLES = ['ADMIN', 'LEAD'] as const;

// Mounted at /api/v1/projects/:projectId/milestones
export const milestonesNestedRouter = Router({ mergeParams: true });
milestonesNestedRouter.use(requireAuth);

milestonesNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const milestones = await prisma.milestone.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { dueDate: 'asc' },
    });
    res.json({ milestones });
  }),
);

milestonesNestedRouter.post(
  '/',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createMilestoneSchema.parse(req.body);
    const milestone = await prisma.milestone.create({
      data: { ...body, dueDate: body.dueDate ? new Date(body.dueDate) : undefined, projectId: req.params.projectId },
    });
    res.status(201).json({ milestone });
  }),
);

// Mounted at /api/v1/milestones
export const milestonesRouter = Router();
milestonesRouter.use(requireAuth);

milestonesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const milestone = await prisma.milestone.findUnique({ where: { id: req.params.id } });
    if (!milestone) throw new NotFoundError('Milestone');
    res.json({ milestone });
  }),
);

milestonesRouter.patch(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = updateMilestoneSchema.parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.isCompleted === true) data.completedAt = new Date();
    if (body.isCompleted === false) data.completedAt = null;
    const milestone = await prisma.milestone.update({ where: { id: req.params.id }, data });
    res.json({ milestone });
  }),
);

milestonesRouter.delete(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const milestone = await prisma.milestone.findUnique({ where: { id: req.params.id } });
    if (!milestone) throw new NotFoundError('Milestone');
    await prisma.$transaction([
      prisma.milestone.updateMany({ where: { parentId: milestone.id }, data: { parentId: milestone.parentId } }),
      prisma.milestone.delete({ where: { id: milestone.id } }),
    ]);
    res.status(204).send();
  }),
);
