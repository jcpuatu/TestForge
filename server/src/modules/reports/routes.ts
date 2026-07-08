import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { prisma } from '../../config/prisma-client';

// Mounted at /api/v1/projects/:projectId/dashboard
export const dashboardRouter = Router({ mergeParams: true });
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId;

    const [suiteCount, caseCount, runs, milestoneCount, planCount] = await Promise.all([
      prisma.suite.count({ where: { projectId } }),
      prisma.testCase.count({ where: { suite: { projectId }, isDeleted: false } }),
      prisma.testRun.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { suite: { select: { name: true } } },
      }),
      prisma.milestone.count({ where: { projectId } }),
      prisma.testPlan.count({ where: { projectId } }),
    ]);

    const runSummaries = await Promise.all(
      runs.map(async (run) => {
        const grouped = await prisma.runCase.groupBy({
          by: ['status'],
          where: { runId: run.id },
          _count: { status: true },
        });
        const counts = { UNTESTED: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, RETEST: 0 };
        for (const row of grouped) counts[row.status as keyof typeof counts] = row._count.status;
        const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
        return {
          id: run.id,
          name: run.name,
          suiteName: run.suite?.name ?? null,
          isCompleted: run.isCompleted,
          createdAt: run.createdAt,
          counts,
          total,
        };
      }),
    );

    const totals = runSummaries.reduce(
      (acc, r) => {
        acc.PASSED += r.counts.PASSED;
        acc.FAILED += r.counts.FAILED;
        acc.BLOCKED += r.counts.BLOCKED;
        acc.RETEST += r.counts.RETEST;
        acc.UNTESTED += r.counts.UNTESTED;
        return acc;
      },
      { PASSED: 0, FAILED: 0, BLOCKED: 0, RETEST: 0, UNTESTED: 0 },
    );
    const totalResults = Object.values(totals).reduce((sum, n) => sum + n, 0);
    const passRate = totalResults > 0 ? totals.PASSED / totalResults : null;

    res.json({
      counts: { suites: suiteCount, cases: caseCount, milestones: milestoneCount, plans: planCount, runs: runs.length },
      passRate,
      totals,
      recentRuns: runSummaries,
    });
  }),
);
