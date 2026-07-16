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

// Mirrors sections/service.ts's collectSectionSubtree — same BFS-over-a-self-relation shape,
// needed here because Milestone.parentId (a real, shipped feature: MilestonesTab renders it as
// an indented tree) means a milestone's own id is only ONE of the ids a run could be scoped to.
async function collectMilestoneSubtree(rootId: string): Promise<string[]> {
  const all: string[] = [rootId];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await prisma.milestone.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    if (children.length === 0) break;
    frontier = children.map((c) => c.id);
    all.push(...frontier);
  }
  return all;
}

async function resolveScopeToRunIds(scope: SummaryScope): Promise<string[]> {
  if (scope.type === 'runs') return scope.ids;

  if (scope.type === 'plan') {
    const runs = await prisma.testRun.findMany({ where: { planId: scope.id }, select: { id: true } });
    return runs.map((r) => r.id);
  }

  if (scope.type === 'milestone') {
    // TestRun.milestoneId is not inherited through a plan at run-creation time (confirmed in
    // runs/service.ts), so a milestone's run-set is a real OR-union of its own direct runs and
    // any run belonging to a plan tied to it. A real bug lived here too: this only checked the
    // milestone's OWN id, but Milestone.parentId means a run can just as validly be attached to
    // a CHILD milestone instead of the umbrella one being viewed — the natural way to use a
    // milestone hierarchy is to attach runs to the specific sprint/child, not the parent, so a
    // release-level Summary report could silently show 0 runs / 0% despite real child-milestone
    // activity underneath it. Same bug class as the already-fixed Project scope (an "these two
    // paths are exhaustive" assumption the data model actually contradicts) — fixed the same
    // way, by resolving the full subtree first instead of just the one id.
    const subtreeIds = await collectMilestoneSubtree(scope.id);
    const runs = await prisma.testRun.findMany({
      where: { OR: [{ milestoneId: { in: subtreeIds } }, { plan: { milestoneId: { in: subtreeIds } } }] },
      select: { id: true },
    });
    return runs.map((r) => r.id);
  }

  // project: every run in the project, full stop — TestRun.projectId is direct, not routed
  // through milestones. A real bug lived here: the original implementation only aggregated runs
  // reachable through one of the project's milestones (`milestone.findMany` then OR'd milestone/
  // plan-milestone matches), so any run created without a milestone — a completely normal,
  // common case, not an edge case — silently never appeared in its own Project Summary, even
  // after being closed with real results. User-reported: "i already closed a run but it is
  // empty." Fixed by querying TestRun.projectId directly instead of walking through milestones.
  const runs = await prisma.testRun.findMany({ where: { projectId: scope.id }, select: { id: true } });
  return runs.map((r) => r.id);
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
  // "Remaining" is UNTESTED, RETEST, and BLOCKED — not just UNTESTED. A real bug lived here: a
  // run that's 100% BLOCKED or 100% RETEST previously showed "100% Complete, 0 Remaining, ~0d,"
  // directly contradicting the StackedStatusBar right next to it on the same screen, and
  // contradicting this app's own Rerun feature, which already defines "still needs another
  // pass" as exactly this same status set (FAILED/BLOCKED/RETEST) elsewhere in the codebase.
  // FAILED isn't counted as "remaining work still to execute" here — it's genuinely done
  // executing, just done with a bad outcome — so it correctly stays out of this set too.
  const remainingCount = statusCounts.UNTESTED + statusCounts.RETEST + statusCounts.BLOCKED;
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
