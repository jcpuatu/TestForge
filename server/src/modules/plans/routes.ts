import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { createPlanSchema, updatePlanSchema } from './schema';

const MANAGE_ROLES = ['ADMIN', 'LEAD'] as const;

// Mounted at /api/v1/projects/:projectId/plans
export const plansNestedRouter = Router({ mergeParams: true });
plansNestedRouter.use(requireAuth);

plansNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const plans = await prisma.testPlan.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { runs: true } }, milestone: { select: { name: true } } },
    });
    res.json({ plans });
  }),
);

plansNestedRouter.post(
  '/',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createPlanSchema.parse(req.body);
    const plan = await prisma.testPlan.create({
      data: { ...body, projectId: req.params.projectId, createdById: req.user!.id },
    });
    res.status(201).json({ plan });
  }),
);

// Mounted at /api/v1/plans
export const plansRouter = Router();
plansRouter.use(requireAuth);

plansRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const plan = await prisma.testPlan.findUnique({
      where: { id: req.params.id },
      include: {
        runs: { include: { suite: { select: { name: true } }, _count: { select: { runCases: true } } } },
        milestone: { select: { id: true, name: true } },
      },
    });
    if (!plan) throw new NotFoundError('Plan');
    res.json({ plan });
  }),
);

plansRouter.patch(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = updatePlanSchema.parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.isCompleted === true) data.completedAt = new Date();
    if (body.isCompleted === false) data.completedAt = null;
    const plan = await prisma.testPlan.update({ where: { id: req.params.id }, data });
    res.json({ plan });
  }),
);

plansRouter.delete(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.testPlan.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);
