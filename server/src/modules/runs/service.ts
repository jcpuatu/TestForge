import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { dispatchWebhookEvent } from '../../lib/webhook-dispatcher';
import { assertUserExists } from '../../lib/assertions';
import { resolveStepsForCases } from '../sharedSteps/service';
import type { createRunSchema } from './schema';
import type { z } from 'zod';

type CreateRunInput = z.infer<typeof createRunSchema>;

// Closed runs are meant to be a frozen historical record — real TestRail's own docs describe
// closing a run as irreversible for exactly this reason (Reopen is this app's own documented,
// deliberate escape hatch, not license to keep writing to a closed run through every other path).
// Before this helper existed, that guarantee was only enforced on the run's own date fields
// (see the PATCH /runs/:id handler) — submitting a result, reassigning a test, or bulk-editing
// a closed run's tests all silently succeeded via direct API use, contradicting the "This test
// run is completed" banner the execution UI shows for the very same state.
export async function assertRunIsOpen(runId: string) {
  const run = await prisma.testRun.findUnique({ where: { id: runId }, select: { isCompleted: true } });
  if (!run) throw new NotFoundError('Run');
  if (run.isCompleted) throw new BadRequestError('This test run is closed and cannot be modified. Reopen or rerun it first.');
}

export async function createRun(projectId: string, input: CreateRunInput, createdById: string) {
  const suite = await prisma.suite.findUnique({ where: { id: input.suiteId } });
  if (!suite || suite.projectId !== projectId) {
    throw new NotFoundError('Suite');
  }
  // Without this, a run could be created (or, via PATCH-equivalents, be moved) onto a milestone
  // belonging to a completely different project — the milestone's dates and name would then
  // display against this run everywhere date-inheritance is shown, with no indication the data
  // came from somewhere else entirely. Same shape of gap as the suite check just above; only the
  // milestone side of it was ever added.
  if (input.milestoneId) {
    const milestone = await prisma.milestone.findUnique({ where: { id: input.milestoneId } });
    if (!milestone || milestone.projectId !== projectId) {
      throw new NotFoundError('Milestone');
    }
  }
  if (input.assignedToId) await assertUserExists(input.assignedToId);

  const cases = await prisma.testCase.findMany({
    where: {
      suiteId: suite.id,
      isDeleted: false,
      ...(input.caseIds ? { id: { in: input.caseIds } } : {}),
    },
    orderBy: { orderIndex: 'asc' },
  });

  if (cases.length === 0) {
    throw new BadRequestError('No matching test cases to include in this run');
  }

  // Resolved (own steps + every attached shared-step-set's steps, flattened) once, up front —
  // the snapshot must be fully self-contained so later edits to a case or a shared set it used
  // never retroactively alter history.
  const resolvedSteps = await resolveStepsForCases(cases);

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.testRun.create({
      data: {
        projectId,
        suiteId: suite.id,
        planId: input.planId,
        milestoneId: input.milestoneId,
        name: input.name,
        description: input.description,
        configLabel: input.configLabel,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        includeAll: !input.caseIds,
        createdById,
      },
    });

    await tx.runCase.createMany({
      data: cases.map((c, index) => ({
        runId: created.id,
        caseId: c.id,
        titleSnapshot: c.title,
        templateSnapshot: c.template,
        stepsSnapshot: (() => {
          const steps = resolvedSteps.get(c.id) ?? [];
          return steps.length > 0 ? JSON.stringify(steps) : null;
        })(),
        expectedSnapshot: c.expectedResult,
        missionSnapshot: c.mission,
        goalsSnapshot: c.goals,
        bddLinesSnapshot: c.bddLines,
        referenceLinkSnapshot: c.referenceLink,
        typeSnapshot: c.type,
        priority: c.priority,
        assignedToId: input.assignedToId,
        orderIndex: index,
      })),
    });

    return created;
  });

  await dispatchWebhookEvent(projectId, 'RUN_CREATED', { runId: run.id, runName: run.name, caseCount: cases.length });

  return run;
}

// One run per selected config, each named "<name> (<config>)" and tagged via the existing
// configLabel free-text field ("<group>: <config>"). Deliberately simpler than real TestRail's
// full cross-group combination matrix — selecting configs across multiple groups still yields
// one run per config, not a cartesian product across groups.
export async function createRunsForConfigs(
  projectId: string,
  input: Omit<CreateRunInput, 'configLabel'>,
  configIds: string[],
  createdById: string,
) {
  const configs = await prisma.config.findMany({
    where: { id: { in: configIds } },
    include: { configGroup: true },
  });
  if (configs.length !== configIds.length) throw new NotFoundError('Configuration');
  if (configs.some((c) => c.configGroup.projectId !== projectId)) throw new BadRequestError('Configuration does not belong to this project');

  // Each config's run is created independently (createRun already wraps its own run+runCases
  // creation in its own transaction) — catching per-config here, instead of letting the first
  // error abort the loop, means a failure on config N doesn't hide that configs 1..N-1 already
  // created real, committed runs the caller would otherwise never learn about.
  const runs = [];
  const failed: { configId: string; configName: string; message: string }[] = [];
  for (const config of configs) {
    try {
      const run = await createRun(
        projectId,
        { ...input, name: `${input.name} (${config.name})`, configLabel: `${config.configGroup.name}: ${config.name}` },
        createdById,
      );
      runs.push(run);
    } catch (err) {
      failed.push({ configId: config.id, configName: config.name, message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }
  if (runs.length === 0 && failed.length > 0) {
    throw new BadRequestError(`Failed to create a run for every selected configuration: ${failed.map((f) => f.configName).join(', ')}`);
  }
  return { runs, failed };
}

// Appends " (2)", " (3)", etc. (same convention as a filesystem refusing to silently overwrite a
// duplicate filename) when baseName already collides with an existing run in the same suite —
// rerunning the identical source run more than once previously produced multiple runs literally
// named e.g. "Smoke (Rerun)", distinguishable only by id/timestamp in the runs list.
async function uniqueRunName(suiteId: string | null, baseName: string): Promise<string> {
  const existing = await prisma.testRun.findMany({ where: { suiteId, name: { startsWith: baseName } }, select: { name: true } });
  const names = new Set(existing.map((r) => r.name));
  if (!names.has(baseName)) return baseName;
  let n = 2;
  while (names.has(`${baseName} (${n})`)) n++;
  return `${baseName} (${n})`;
}

// Clones the ORIGINAL run's snapshots directly (title/steps/etc. as they were when that run was
// created), never re-pulling from the live TestCase — a rerun must test the exact instructions
// that produced the selected statuses, not a possibly-since-edited version. Matches real
// TestRail's own rerun semantics and this project's existing run-immutability discipline.
export async function rerunRun(
  runId: string,
  options: { statuses: string[]; copyAssignees: boolean; name?: string },
  createdById: string,
) {
  const original = await prisma.testRun.findUnique({ where: { id: runId } });
  if (!original) throw new NotFoundError('Run');

  const matching = await prisma.runCase.findMany({
    where: { runId, status: { in: options.statuses } },
    orderBy: { orderIndex: 'asc' },
  });
  if (matching.length === 0) {
    throw new BadRequestError('No tests in this run match the selected statuses');
  }

  const name = await uniqueRunName(original.suiteId, options.name || `${original.name} (Rerun)`);

  const newRun = await prisma.$transaction(async (tx) => {
    const created = await tx.testRun.create({
      data: {
        projectId: original.projectId,
        suiteId: original.suiteId,
        planId: original.planId,
        milestoneId: original.milestoneId,
        name,
        description: original.description,
        configLabel: original.configLabel,
        includeAll: false,
        createdById,
      },
    });

    await tx.runCase.createMany({
      data: matching.map((rc, index) => ({
        runId: created.id,
        caseId: rc.caseId,
        titleSnapshot: rc.titleSnapshot,
        templateSnapshot: rc.templateSnapshot,
        stepsSnapshot: rc.stepsSnapshot,
        expectedSnapshot: rc.expectedSnapshot,
        missionSnapshot: rc.missionSnapshot,
        goalsSnapshot: rc.goalsSnapshot,
        bddLinesSnapshot: rc.bddLinesSnapshot,
        referenceLinkSnapshot: rc.referenceLinkSnapshot,
        typeSnapshot: rc.typeSnapshot,
        priority: rc.priority,
        assignedToId: options.copyAssignees ? rc.assignedToId : undefined,
        orderIndex: index,
      })),
    });

    return created;
  });

  await dispatchWebhookEvent(original.projectId, 'RUN_CREATED', { runId: newRun.id, runName: newRun.name, caseCount: matching.length });

  return newRun;
}

export async function getRunSummary(runId: string) {
  const grouped = await prisma.runCase.groupBy({
    by: ['status'],
    where: { runId },
    _count: { status: true },
  });

  const counts = { UNTESTED: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, RETEST: 0 };
  for (const row of grouped) {
    counts[row.status as keyof typeof counts] = row._count.status;
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { counts, total };
}
