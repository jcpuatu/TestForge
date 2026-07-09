import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { dispatchWebhookEvent } from '../../lib/webhook-dispatcher';
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
        stepsSnapshot: c.steps,
        expectedSnapshot: c.expectedResult,
        missionSnapshot: c.mission,
        goalsSnapshot: c.goals,
        priority: c.priority,
        orderIndex: index,
      })),
    });

    return created;
  });

  await dispatchWebhookEvent(projectId, 'RUN_CREATED', { runId: run.id, runName: run.name, caseCount: cases.length });

  return run;
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
