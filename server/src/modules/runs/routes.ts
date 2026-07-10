import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { createRunSchema, rerunSchema, updateRunSchema } from './schema';
import { createRun, createRunsForConfigs, getRunSummary, rerunRun } from './service';
import { toPublicRunCase } from './serialize';
import { dispatchWebhookEvent } from '../../lib/webhook-dispatcher';
import { defectsToJiraCsv } from './defectsCsv';
import { bulkAssignSchema } from '../results/schema';
import { logAudit } from '../../lib/audit';

const MANAGE_ROLES = ['ADMIN', 'LEAD'] as const;
const WRITE_ROLES = ['ADMIN', 'LEAD', 'TESTER'] as const;

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

runsByPlanRouter.post(
  '/by-config',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const plan = await prisma.testPlan.findUnique({ where: { id: req.params.planId } });
    if (!plan) throw new NotFoundError('Plan');
    const { configIds, ...rest } = req.body ?? {};
    if (!Array.isArray(configIds) || configIds.length === 0) {
      throw new BadRequestError('configIds must be a non-empty array');
    }
    const body = createRunSchema.omit({ configLabel: true }).parse({ ...rest, planId: plan.id });
    const runs = await createRunsForConfigs(plan.projectId, body, configIds, req.user!.id);
    res.status(201).json({ runs });
  }),
);

// Mounted at /api/v1/runs
export const runsRouter = Router();
runsRouter.use(requireAuth);

runsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const run = await prisma.testRun.findUnique({
      where: { id: req.params.id },
      include: {
        suite: true,
        plan: { select: { id: true, name: true, startDate: true, endDate: true } },
        milestone: { select: { id: true, name: true, startDate: true, dueDate: true } },
      },
    });
    if (!run) throw new NotFoundError('Run');
    res.json({ run });
  }),
);

runsRouter.patch(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const { assignedToId, ...body } = updateRunSchema.parse(req.body);
    const existing = await prisma.testRun.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Run');
    if (existing.isCompleted && (body.startDate !== undefined || body.endDate !== undefined)) {
      throw new BadRequestError('Cannot change dates on a completed run');
    }
    const data: Record<string, unknown> = { ...body };
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
    if (assignedToId !== undefined) {
      await prisma.runCase.updateMany({ where: { runId: req.params.id }, data: { assignedToId } });
    }
    const run = await prisma.testRun.update({ where: { id: req.params.id }, data });
    if (body.startDate !== undefined || body.endDate !== undefined) {
      await logAudit({
        projectId: run.projectId,
        actorId: req.user!.id,
        action: 'RUN_DATES_CHANGED',
        entityType: 'TestRun',
        entityId: run.id,
        summary: `Changed dates on run "${run.name}"`,
      });
    }
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
    await logAudit({
      projectId: run.projectId,
      actorId: req.user!.id,
      action: 'RUN_CLOSED',
      entityType: 'TestRun',
      entityId: run.id,
      summary: `Closed run "${run.name}" (${summary.total} test(s): ${summary.counts.PASSED} passed, ${summary.counts.FAILED} failed)`,
    });
    res.json({ run });
  }),
);

runsRouter.post(
  '/:id/rerun',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = rerunSchema.parse(req.body);
    const run = await rerunRun(req.params.id, body, req.user!.id);
    res.status(201).json({ run });
  }),
);

runsRouter.post(
  '/:id/reopen',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const run = await prisma.testRun.update({
      where: { id: req.params.id },
      data: { isCompleted: false, completedAt: null },
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
      include: {
        assignedTo: { select: { id: true, name: true } },
        results: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    res.json({ tests: runCases.map(toPublicRunCase) });
  }),
);

runsRouter.post(
  '/:id/tests/bulk-assign',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const body = bulkAssignSchema.parse(req.body);
    const result = await prisma.runCase.updateMany({
      where: { id: { in: body.testIds }, runId: req.params.id },
      data: { assignedToId: body.assignedToId },
    });
    res.json({ updated: result.count });
  }),
);

runsRouter.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    const summary = await getRunSummary(req.params.id);
    res.json(summary);
  }),
);

runsRouter.get(
  '/:id/defects/export',
  asyncHandler(async (req, res) => {
    const run = await prisma.testRun.findUnique({ where: { id: req.params.id }, include: { suite: true } });
    if (!run) throw new NotFoundError('Run');
    const runCases = await prisma.runCase.findMany({
      where: { runId: run.id },
      orderBy: { orderIndex: 'asc' },
      include: { results: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const csv = defectsToJiraCsv(runCases, run.name, run.suite?.name);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${run.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-defects.csv"`);
    res.send(csv);
  }),
);
