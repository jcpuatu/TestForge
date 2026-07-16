import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { prisma } from '../../config/prisma-client';
import { getActivitySummary, getCasePropertyDistribution, getCoverageForReferences, getStatusTops } from './casesReports';
import { aggregateDefects, fetchLatestResultPerRunCase } from './runsMatrix';
import {
  getDefectsSummary,
  getDefectsSummaryForCases,
  getDefectsSummaryForReferences,
} from './defectsReports';
import {
  getComparisonForCases,
  getComparisonForReferences,
  getResultPropertyDistribution,
} from './resultsReports';
import { buildSummaryReport, parseRunsScopeQuery } from './summaryReports';

// Mounted at /api/v1/projects/:projectId/dashboard
export const dashboardRouter = Router({ mergeParams: true });
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId;

    const [suiteCount, caseCount, runs, milestoneCount, planCount, activeGrouped] = await Promise.all([
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
      // Scoped to every active (non-completed) run in the project, NOT just the 10 most recent
      // ones fetched above — a real, confirmed bug: this dashboard's totals/passRate used to be
      // computed from whatever the 10-recent-runs-regardless-of-status list happened to contain,
      // which could include closed runs and silently disagreed with the cross-project dashboard's
      // "active runs only" scoping for the identical project (reproduced: 50% vs 0% on the same
      // data). This now matches that same scoping, and root CLAUDE.md's own claim that it does.
      prisma.runCase.groupBy({
        by: ['status'],
        where: { run: { projectId, isCompleted: false } },
        _count: { status: true },
      }),
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

    const totals = { UNTESTED: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, RETEST: 0 };
    for (const row of activeGrouped) totals[row.status as keyof typeof totals] = row._count.status;
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

// Mounted at /api/v1/dashboard — aggregates across every project (roles are global, not
// per-project, so every authenticated user can see every project; matches the existing
// ProjectsListPage behavior of listing all projects unfiltered).
export const crossProjectDashboardRouter = Router();
crossProjectDashboardRouter.use(requireAuth);

crossProjectDashboardRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const projects = await prisma.project.findMany({ orderBy: { name: 'asc' } });

    const perProject = await Promise.all(
      projects.map(async (p) => {
        const [suiteCount, caseCount, runCount, milestoneCount, grouped] = await Promise.all([
          prisma.suite.count({ where: { projectId: p.id } }),
          prisma.testCase.count({ where: { suite: { projectId: p.id }, isDeleted: false } }),
          prisma.testRun.count({ where: { projectId: p.id } }),
          prisma.milestone.count({ where: { projectId: p.id } }),
          prisma.runCase.groupBy({
            by: ['status'],
            where: { run: { projectId: p.id, isCompleted: false } },
            _count: { status: true },
          }),
        ]);
        const statusCounts = { UNTESTED: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, RETEST: 0 };
        for (const row of grouped) statusCounts[row.status as keyof typeof statusCounts] = row._count.status;
        const total = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);

        return {
          id: p.id,
          name: p.name,
          isCompleted: p.isCompleted,
          counts: { suites: suiteCount, cases: caseCount, runs: runCount, milestones: milestoneCount },
          statusCounts,
          total,
        };
      }),
    );

    const totals = perProject.reduce(
      (acc, p) => {
        acc.PASSED += p.statusCounts.PASSED;
        acc.FAILED += p.statusCounts.FAILED;
        acc.BLOCKED += p.statusCounts.BLOCKED;
        acc.RETEST += p.statusCounts.RETEST;
        acc.UNTESTED += p.statusCounts.UNTESTED;
        return acc;
      },
      { PASSED: 0, FAILED: 0, BLOCKED: 0, RETEST: 0, UNTESTED: 0 },
    );
    const totalResults = Object.values(totals).reduce((sum, n) => sum + n, 0);
    const passRate = totalResults > 0 ? totals.PASSED / totalResults : null;

    res.json({
      counts: {
        projects: projects.length,
        suites: perProject.reduce((sum, p) => sum + p.counts.suites, 0),
        cases: perProject.reduce((sum, p) => sum + p.counts.cases, 0),
        runs: perProject.reduce((sum, p) => sum + p.counts.runs, 0),
        milestones: perProject.reduce((sum, p) => sum + p.counts.milestones, 0),
      },
      totals,
      passRate,
      projects: perProject,
    });
  }),
);

// Mounted at /api/v1/projects/:projectId/defects
export const defectsRouter = Router({ mergeParams: true });
defectsRouter.use(requireAuth);

defectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const runCases = await fetchLatestResultPerRunCase({ run: { projectId: req.params.projectId } });
    res.json({ defects: aggregateDefects(runCases) });
  }),
);

// Mounted at /api/v1/projects/:projectId/reports/cases — the four "Cases Reports" (Activity
// Summary, Coverage for References, Property Distribution, Status Tops). All read-only, all
// project-scoped (spanning every suite in the project, matching dashboardRouter's scope).
export const casesReportsRouter = Router({ mergeParams: true });
casesReportsRouter.use(requireAuth);

casesReportsRouter.get(
  '/activity-summary',
  asyncHandler(async (req, res) => {
    res.json(await getActivitySummary(req.params.projectId, req.query as Record<string, unknown>));
  }),
);

casesReportsRouter.get(
  '/coverage-for-references',
  asyncHandler(async (req, res) => {
    res.json(await getCoverageForReferences(req.params.projectId, req.query as Record<string, unknown>));
  }),
);

casesReportsRouter.get(
  '/property-distribution',
  asyncHandler(async (req, res) => {
    res.json(await getCasePropertyDistribution(req.params.projectId, req.query as Record<string, unknown>));
  }),
);

casesReportsRouter.get(
  '/status-tops',
  asyncHandler(async (req, res) => {
    res.json(await getStatusTops(req.params.projectId, req.query as Record<string, unknown>));
  }),
);

// Mounted at /api/v1/projects/:projectId/reports/defects — the three "Defects Reports"
// (Summary, Summary for Cases, Summary for References), all scoped to a set of test runs.
export const defectsReportsRouter = Router({ mergeParams: true });
defectsReportsRouter.use(requireAuth);

defectsReportsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json(await getDefectsSummary(req.params.projectId, req.query as Record<string, unknown>));
  }),
);

defectsReportsRouter.get(
  '/summary-for-cases',
  asyncHandler(async (req, res) => {
    res.json(await getDefectsSummaryForCases(req.params.projectId, req.query as Record<string, unknown>));
  }),
);

defectsReportsRouter.get(
  '/summary-for-references',
  asyncHandler(async (req, res) => {
    res.json(await getDefectsSummaryForReferences(req.params.projectId, req.query as Record<string, unknown>));
  }),
);

// Mounted at /api/v1/projects/:projectId/reports/results — the three "Results Reports"
// (Comparison for Cases, Comparison for References, Property Distribution).
export const resultsReportsRouter = Router({ mergeParams: true });
resultsReportsRouter.use(requireAuth);

resultsReportsRouter.get(
  '/comparison-for-cases',
  asyncHandler(async (req, res) => {
    res.json(await getComparisonForCases(req.params.projectId, req.query as Record<string, unknown>));
  }),
);

resultsReportsRouter.get(
  '/comparison-for-references',
  asyncHandler(async (req, res) => {
    res.json(await getComparisonForReferences(req.params.projectId, req.query as Record<string, unknown>));
  }),
);

resultsReportsRouter.get(
  '/property-distribution',
  asyncHandler(async (req, res) => {
    res.json(await getResultPropertyDistribution(req.params.projectId, req.query as Record<string, unknown>));
  }),
);

// ── Summary Reports ─────────────────────────────────────────────────────
// Four scope types, one shared aggregation core (buildSummaryReport). Milestone/Plan mount
// under their own resource path (matching the milestones/plans modules' own `/milestones/:id`
// and `/plans/:id` convention) since a report "for milestone X" isn't naturally nested under a
// project path the way the run-scoped reports above are.

export const milestoneSummaryReportRouter = Router({ mergeParams: true });
milestoneSummaryReportRouter.use(requireAuth);
milestoneSummaryReportRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await buildSummaryReport({ type: 'milestone', id: req.params.milestoneId }, req.query as Record<string, unknown>));
  }),
);

export const planSummaryReportRouter = Router({ mergeParams: true });
planSummaryReportRouter.use(requireAuth);
planSummaryReportRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await buildSummaryReport({ type: 'plan', id: req.params.planId }, req.query as Record<string, unknown>));
  }),
);

// Mounted at /api/v1/projects/:projectId/reports/summary (project scope) and
// /api/v1/projects/:projectId/reports/runs-summary (explicit runIds scope) — both project-
// scoped for the auth/data-boundary check even though "runs" scope takes an explicit id list.
// Named runs-summary (not summary-runs) specifically so it isn't a string-prefix of the
// sibling /reports/summary mount path, sidestepping any doubt about Express's app.use()
// prefix-matching semantics rather than relying on it being boundary-aware.
export const projectSummaryReportRouter = Router({ mergeParams: true });
projectSummaryReportRouter.use(requireAuth);
projectSummaryReportRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await buildSummaryReport({ type: 'project', id: req.params.projectId }, req.query as Record<string, unknown>));
  }),
);

export const runsSummaryReportRouter = Router({ mergeParams: true });
runsSummaryReportRouter.use(requireAuth);
runsSummaryReportRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await buildSummaryReport(parseRunsScopeQuery(req.query as Record<string, unknown>), req.query as Record<string, unknown>));
  }),
);
