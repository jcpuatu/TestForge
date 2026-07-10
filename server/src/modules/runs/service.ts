import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { dispatchWebhookEvent } from '../../lib/webhook-dispatcher';
import { resolveStepsForCases } from '../sharedSteps/service';
import type { createRunSchema } from './schema';
import type { z } from 'zod';

type CreateRunInput = z.infer<typeof createRunSchema>;

export async function createRun(projectId: string, input: CreateRunInput, createdById: string) {
  const suite = await prisma.suite.findUnique({ where: { id: input.suiteId } });
  if (!suite || suite.projectId !== projectId) {
    throw new NotFoundError('Suite');
  }

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
        priority: c.priority,
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

  const runs = [];
  for (const config of configs) {
    const run = await createRun(
      projectId,
      { ...input, name: `${input.name} (${config.name})`, configLabel: `${config.configGroup.name}: ${config.name}` },
      createdById,
    );
    runs.push(run);
  }
  return runs;
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

  const newRun = await prisma.$transaction(async (tx) => {
    const created = await tx.testRun.create({
      data: {
        projectId: original.projectId,
        suiteId: original.suiteId,
        planId: original.planId,
        milestoneId: original.milestoneId,
        name: options.name || `${original.name} (Rerun)`,
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
