import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { createRunSchema, rerunSchema, updateRunSchema } from './schema';
import { assertRunIsOpen, createRun, createRunsForConfigs, getRunSummary, rerunRun } from './service';
import { assertUserExists } from '../../lib/assertions';
import { toPublicRunCase } from './serialize';
import { dispatchWebhookEvent } from '../../lib/webhook-dispatcher';
import { defectsToJiraCsv } from './defectsCsv';
import { bulkAssignSchema, bulkResultSchema } from '../results/schema';
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
    // Per-run status breakdown so the Runs list can show a pass/fail bar without a click-through
    // per run (previously this list showed less status info than the Overview dashboard's own
    // "Recent runs" widget, which already computes this the same way for its top-10 slice).
    const summaries = await Promise.all(runs.map((run) => getRunSummary(run.id)));
    res.json({ runs: runs.map((run, i) => ({ ...run, ...summaries[i] })) });
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
    const { runs, failed } = await createRunsForConfigs(plan.projectId, body, configIds, req.user!.id);
    res.status(201).json({ runs, failed });
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
        // plan.milestone is nested here (not just the run's own direct milestone below) because
        // a run created under a plan never has that plan's milestoneId copied onto its own
        // milestoneId field (see runs/service.ts) — without this, the date-inheritance chain
        // silently broke at the second hop: a Plan showed "Inherits milestone due date" for its
        // own missing dates just fine, but a Run under that same Plan had no way to see the
        // milestone's date at all, so it fell straight through to "No dates set" even though the
        // exact same milestone was one click away on the Plan.
        plan: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            milestone: { select: { id: true, name: true, startDate: true, dueDate: true } },
          },
        },
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
    if (existing.isCompleted && assignedToId !== undefined) {
      throw new BadRequestError('Cannot reassign tests on a completed run');
    }
    if (assignedToId) await assertUserExists(assignedToId);
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
    // Reopen is this app's own documented, deliberate deviation from real TestRail's "closed is
    // permanent" behavior — exactly the kind of easily-second-guessed action the Activity log
    // exists for (per ActivityTab.tsx's own framing), yet it previously left no trace at all.
    await logAudit({
      projectId: run.projectId,
      actorId: req.user!.id,
      action: 'RUN_REOPENED',
      entityType: 'TestRun',
      entityId: run.id,
      summary: `Reopened run "${run.name}"`,
    });
    res.json({ run });
  }),
);

// No client code calls DELETE /runs/:id today (Reopen/Rerun are the UI's own paths back from a
// closed run) — this is a documented, dual-auth REST API surface with real destructive blast
// radius and, unlike every other similarly-destructive route in this codebase, had neither an
// audit trail nor a paired impact preview. Added for parity, not because a UI regression
// depends on it.
runsRouter.get(
  '/:id/delete-impact',
  asyncHandler(async (req, res) => {
    const run = await prisma.testRun.findUnique({ where: { id: req.params.id } });
    if (!run) throw new NotFoundError('Run');
    const [testCount, resultCount] = await Promise.all([
      prisma.runCase.count({ where: { runId: run.id } }),
      prisma.result.count({ where: { runCase: { runId: run.id } } }),
    ]);
    res.json({ testCount, resultCount });
  }),
);

runsRouter.delete(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const run = await prisma.testRun.findUnique({ where: { id: req.params.id } });
    if (!run) throw new NotFoundError('Run');
    await prisma.testRun.delete({ where: { id: req.params.id } });
    await logAudit({
      projectId: run.projectId,
      actorId: req.user!.id,
      action: 'RUN_DELETED',
      entityType: 'TestRun',
      entityId: run.id,
      summary: `Permanently deleted run "${run.name}"`,
    });
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
    await assertRunIsOpen(req.params.id);
    if (body.assignedToId) await assertUserExists(body.assignedToId);
    const result = await prisma.runCase.updateMany({
      where: { id: { in: body.testIds }, runId: req.params.id },
      data: { assignedToId: body.assignedToId },
    });
    res.json({ updated: result.count });
  }),
);

runsRouter.post(
  '/:id/tests/bulk-result',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const body = bulkResultSchema.parse(req.body);
    await assertRunIsOpen(req.params.id);
    // Scope to this run first so a testId from a different run can't be targeted, then create
    // one Result per matched test (createMany — one batched insert, not a loop) and flip every
    // matched RunCase's denormalized status in a single updateMany, matching the same
    // create-one-set-status-in-one-transaction shape the single-test submit endpoint uses.
    const matched = await prisma.runCase.findMany({
      where: { id: { in: body.testIds }, runId: req.params.id },
      select: { id: true },
    });
    const matchedIds = matched.map((m) => m.id);
    if (matchedIds.length === 0) {
      res.json({ updated: 0 });
      return;
    }
    await prisma.$transaction([
      prisma.result.createMany({
        data: matchedIds.map((runCaseId) => ({
          runCaseId,
          status: body.status,
          comment: body.comment,
          enteredById: req.user!.id,
        })),
      }),
      prisma.runCase.updateMany({ where: { id: { in: matchedIds } }, data: { status: body.status } }),
    ]);
    res.json({ updated: matchedIds.length });
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
