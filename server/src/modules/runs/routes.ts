import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { createRunSchema, updateRunSchema } from './schema';
import { createRun, getRunSummary } from './service';
import { toPublicRunCase } from './serialize';
import { dispatchWebhookEvent } from '../../lib/webhook-dispatcher';

const MANAGE_ROLES = ['ADMIN', 'LEAD'] as const;

// Mounted at /api/v1/projects/:projectId/runs
export const runsNestedRouter = Router({ mergeParams: true });
runsNestedRouter.use(requireAuth);

runsNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const runs = await prisma.testRun.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { runCases: true } }, suite: { select: { name: true } } },
    });
    res.json({ runs });
  }),
);

runsNestedRouter.post(
  '/',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createRunSchema.parse(req.body);
    const run = await createRun(req.params.projectId, body, req.user!.id);
    res.status(201).json({ run });
  }),
);

// Mounted at /api/v1/plans/:planId/runs
export const runsByPlanRouter = Router({ mergeParams: true });
runsByPlanRouter.use(requireAuth);

runsByPlanRouter.post(
  '/',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const plan = await prisma.testPlan.findUnique({ where: { id: req.params.planId } });
    if (!plan) throw new NotFoundError('Plan');
    const body = createRunSchema.parse({ ...req.body, planId: plan.id });
    const run = await createRun(plan.projectId, body, req.user!.id);
    res.status(201).json({ run });
  }),
);

// Mounted at /api/v1/runs
export const runsRouter = Router();
runsRouter.use(requireAuth);

runsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const run = await prisma.testRun.findUnique({ where: { id: req.params.id }, include: { suite: true } });
    if (!run) throw new NotFoundError('Run');
    res.json({ run });
  }),
);

runsRouter.patch(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = updateRunSchema.parse(req.body);
    const run = await prisma.testRun.update({ where: { id: req.params.id }, data: body });
    res.json({ run });
  }),
);

runsRouter.post(
  '/:id/close',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const run = await prisma.testRun.update({
      where: { id: req.params.id },
      data: { isCompleted: true, completedAt: new Date() },
    });
    const summary = await getRunSummary(run.id);
    await dispatchWebhookEvent(run.projectId, 'RUN_COMPLETED', {
      runId: run.id,
      runName: run.name,
      ...summary,
    });
    res.json({ run });
  }),
);

runsRouter.delete(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.testRun.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

runsRouter.get(
  '/:id/tests',
  asyncHandler(async (req, res) => {
    const runCases = await prisma.runCase.findMany({
      where: { runId: req.params.id },
      orderBy: { orderIndex: 'asc' },
      include: { assignedTo: { select: { id: true, name: true } } },
    });
    res.json({ tests: runCases.map(toPublicRunCase) });
  }),
);

runsRouter.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    const summary = await getRunSummary(req.params.id);
    res.json(summary);
  }),
);
