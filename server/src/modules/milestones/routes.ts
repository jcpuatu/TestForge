import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { createMilestoneSchema, updateMilestoneSchema } from './schema';
import { logAudit } from '../../lib/audit';

const MANAGE_ROLES = ['ADMIN', 'LEAD'] as const;

// Mounted at /api/v1/projects/:projectId/milestones
export const milestonesNestedRouter = Router({ mergeParams: true });
milestonesNestedRouter.use(requireAuth);

milestonesNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    // nulls: 'last' — plain `dueDate: 'asc'` sorts NULL due dates FIRST, so a single undated
    // "misc/backlog" milestone would always occupy index 0. That's a bad list order on its own,
    // and it was actively harmful for MilestoneSummaryReport's picker, which defaults to
    // `milestones[0]` — an undated milestone would silently become the default report even
    // though "how's this doing against its due date" is the whole point of that report.
    const milestones = await prisma.milestone.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
    });
    res.json({ milestones });
  }),
);

milestonesNestedRouter.post(
  '/',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createMilestoneSchema.parse(req.body);
    // Previously unvalidated: a nonexistent parentId 500'd (a raw Prisma FK-constraint error, now
    // at least caught cleanly by errorHandler.ts, but still not the right status/message), and a
    // parentId from a DIFFERENT project silently succeeded — the resulting milestone was real in
    // the DB but invisible in its own project's Milestones tree, since the tree-builder only
    // walks nodes actually present in that project's own fetched list.
    if (body.parentId) {
      const parent = await prisma.milestone.findUnique({ where: { id: body.parentId } });
      if (!parent || parent.projectId !== req.params.projectId) {
        throw new NotFoundError('Parent milestone');
      }
    }
    const milestone = await prisma.milestone.create({
      data: {
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        projectId: req.params.projectId,
      },
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
    const existing = await prisma.milestone.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Milestone');
    if (existing.isCompleted && (body.startDate !== undefined || body.dueDate !== undefined)) {
      throw new BadRequestError('Cannot change dates on a completed milestone');
    }
    const data: Record<string, unknown> = { ...body };
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.isCompleted === true) data.completedAt = new Date();
    if (body.isCompleted === false) data.completedAt = null;
    const milestone = await prisma.milestone.update({ where: { id: req.params.id }, data });
    if (body.startDate !== undefined || body.dueDate !== undefined) {
      await logAudit({
        projectId: milestone.projectId,
        actorId: req.user!.id,
        action: 'MILESTONE_DATES_CHANGED',
        entityType: 'Milestone',
        entityId: milestone.id,
        summary: `Changed dates on milestone "${milestone.name}"`,
      });
    }
    res.json({ milestone });
  }),
);

// Milestone delete has real blast radius (unlike a plain field edit) but, unlike Suite/Section/
// Project delete, had no paired preview endpoint and no client confirmation — a single click
// silently unlinked every plan/run tied to it and reparented every child milestone. Matches the
// same GET .../:id/delete-impact convention those other destructive deletes already use.
milestonesRouter.get(
  '/:id/delete-impact',
  asyncHandler(async (req, res) => {
    const milestone = await prisma.milestone.findUnique({ where: { id: req.params.id } });
    if (!milestone) throw new NotFoundError('Milestone');
    const [planCount, runCount, childMilestoneCount] = await Promise.all([
      prisma.testPlan.count({ where: { milestoneId: milestone.id } }),
      prisma.testRun.count({ where: { milestoneId: milestone.id } }),
      prisma.milestone.count({ where: { parentId: milestone.id } }),
    ]);
    res.json({ planCount, runCount, childMilestoneCount });
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
