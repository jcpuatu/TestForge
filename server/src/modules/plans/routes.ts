import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { createPlanSchema, rerunPlanSchema, updatePlanSchema } from './schema';
import { rerunPlan } from './service';
import { logAudit } from '../../lib/audit';

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
    // Unvalidated before this, a plan's milestoneId could reference a milestone in a completely
    // different project — confirmed live (see test) to leak that foreign milestone's name/dates
    // into this plan's own Date Inheritance display, including on a plan that already has real
    // run history.
    if (body.milestoneId) {
      const milestone = await prisma.milestone.findUnique({ where: { id: body.milestoneId } });
      if (!milestone || milestone.projectId !== req.params.projectId) {
        throw new NotFoundError('Milestone');
      }
    }
    const plan = await prisma.testPlan.create({
      data: {
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        projectId: req.params.projectId,
        createdById: req.user!.id,
      },
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
        milestone: { select: { id: true, name: true, startDate: true, dueDate: true } },
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
    const existing = await prisma.testPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Plan');
    if (existing.isCompleted && (body.startDate !== undefined || body.endDate !== undefined)) {
      throw new BadRequestError('Cannot change dates on a completed plan');
    }
    if (body.milestoneId) {
      const milestone = await prisma.milestone.findUnique({ where: { id: body.milestoneId } });
      if (!milestone || milestone.projectId !== existing.projectId) {
        throw new NotFoundError('Milestone');
      }
    }
    const data: Record<string, unknown> = { ...body };
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.isCompleted === true) data.completedAt = new Date();
    if (body.isCompleted === false) data.completedAt = null;
    const plan = await prisma.testPlan.update({ where: { id: req.params.id }, data });
    if (body.startDate !== undefined || body.endDate !== undefined) {
      await logAudit({
        projectId: plan.projectId,
        actorId: req.user!.id,
        action: 'PLAN_DATES_CHANGED',
        entityType: 'TestPlan',
        entityId: plan.id,
        summary: `Changed dates on plan "${plan.name}"`,
      });
    }
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

plansRouter.post(
  '/:id/rerun',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = rerunPlanSchema.parse(req.body);
    const result = await rerunPlan(req.params.id, body, req.user!.id);
    res.status(201).json(result);
  }),
);
