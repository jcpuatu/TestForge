import { prisma } from '../../config/prisma-client';
import { bucketByPeriod, fillPeriodGaps, resolveDateRangePreset, splitCsvParam, type DateRangePreset } from './aggregation';

// Milestone/Plan/Project/Runs are structurally different scopes (a milestone's run-set is a
// real union of its own runs plus its plans' runs; a project aggregates every milestone; Runs
// is an explicit id list) — resolved here, once, into a flat run-id list that the aggregation
// core below doesn't need to know the scope type to consume.
export type SummaryScope =
  | { type: 'milestone'; id: string }
  | { type: 'plan'; id: string }
  | { type: 'project'; id: string }
  | { type: 'runs'; ids: string[] };

async function resolveScopeToRunIds(scope: SummaryScope): Promise<string[]> {
  if (scope.type === 'runs') return scope.ids;

  if (scope.type === 'plan') {
    const runs = await prisma.testRun.findMany({ where: { planId: scope.id }, select: { id: true } });
    return runs.map((r) => r.id);
  }

  if (scope.type === 'milestone') {
    // TestRun.milestoneId is not inherited through a plan at run-creation time (confirmed in
    // runs/service.ts), so a milestone's run-set is a real OR-union of its own direct runs and
    // any run belonging to a plan tied to it.
    const runs = await prisma.testRun.findMany({
      where: { OR: [{ milestoneId: scope.id }, { plan: { milestoneId: scope.id } }] },
      select: { id: true },
    });
    return runs.map((r) => r.id);
  }

  // project: every milestone in the project, each resolved the same way as above and
  // deduped — child milestones are NOT rolled into their parent's totals (matches
  // MilestonesTab's own flat-list-with-indentation display, avoids ambiguous rollup math).
  const milestones = await prisma.milestone.findMany({ where: { projectId: scope.id }, select: { id: true } });
  if (milestones.length === 0) return [];
  const runs = await prisma.testRun.findMany({
    where: { OR: milestones.flatMap((m) => [{ milestoneId: m.id }, { plan: { milestoneId: m.id } }]) },
    select: { id: true },
  });
  return [...new Set(runs.map((r) => r.id))];
}

const STATUS_KEYS = ['PASSED', 'FAILED', 'BLOCKED', 'RETEST', 'UNTESTED'] as const;

function emptyStatusCounts(): Record<string, number> {
  return { PASSED: 0, FAILED: 0, BLOCKED: 0, RETEST: 0, UNTESTED: 0 };
}

export async function buildSummaryReport(scope: SummaryScope, query: Record<string, unknown>) {
  const runIds = await resolveScopeToRunIds(scope);

  const [runs, runCases] = await Promise.all([
    prisma.testRun.findMany({ where: { id: { in: runIds } }, select: { id: true, name: true, isCompleted: true } }),
    prisma.runCase.findMany({
      where: { runId: { in: runIds } },
      select: { id: true, titleSnapshot: true, status: true, runId: true, assignedTo: { select: { name: true } } },
    }),
  ]);

  const statusCounts = emptyStatusCounts();
  for (const rc of runCases) statusCounts[rc.status] = (statusCounts[rc.status] ?? 0) + 1;
  const total = runCases.length;
  const passRate = total > 0 ? statusCounts.PASSED / total : null;

  const preset = (typeof query.preset === 'string' ? query.preset : 'thisMonth') as DateRangePreset;
  const { from, to } = resolveDateRangePreset(preset, new Date(), query.from as string | undefined, query.to as string | undefined);

  const results =
    runIds.length > 0
      ? await prisma.result.findMany({
          where: { runCase: { runId: { in: runIds } }, createdAt: { gte: from, lte: to } },
          select: { status: true, createdAt: true },
        })
      : [];

  const periods = fillPeriodGaps(bucketByPeriod(results, (r) => r.createdAt, 'day'), from, to, 'day').map((b) => b.period);
  // Built with named fields rather than `{ period, ...counts }` — spreading a bare
  // Record<string, number> into an object literal doesn't carry its index signature into the
  // inferred result type, so a later `d[k]` lookup below would be an implicit-any/TS7053 error.
  const activityByDay = periods.map((period) => {
    const counts = emptyStatusCounts();
    for (const r of results) {
      if (r.createdAt.toISOString().slice(0, 10) === period) counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return {
      period,
      PASSED: counts.PASSED,
      FAILED: counts.FAILED,
      BLOCKED: counts.BLOCKED,
      RETEST: counts.RETEST,
      UNTESTED: counts.UNTESTED,
    };
  });

  // Simplified progress estimate — real TestRail's velocity-based forecast is explicitly out
  // of scope (see root CLAUDE.md); this is a plainly-labeled "at current pace" projection.
  const remainingCount = statusCounts.UNTESTED;
  const completedCount = total - remainingCount;
  const percentComplete = total > 0 ? completedCount / total : 0;
  const activeDayCount = activityByDay.filter((d) => STATUS_KEYS.some((k) => d[k] > 0)).length;
  const averagePerDay = activeDayCount > 0 ? results.length / activeDayCount : 0;
  const estimatedDaysRemaining = averagePerDay > 0 ? Math.ceil(remainingCount / averagePerDay) : null;

  return {
    runs,
    statusCounts,
    total,
    passRate,
    activityFrom: from.toISOString(),
    activityTo: to.toISOString(),
    activityByDay,
    progress: { completedCount, remainingCount, percentComplete, estimatedDaysRemaining },
    tests: runCases.slice(0, 200).map((rc) => ({
      id: rc.id,
      title: rc.titleSnapshot,
      status: rc.status,
      runId: rc.runId,
      assignedTo: rc.assignedTo?.name ?? null,
    })),
  };
}

export function parseRunsScopeQuery(query: Record<string, unknown>): SummaryScope {
  return { type: 'runs', ids: splitCsvParam(query.runIds) };
}
