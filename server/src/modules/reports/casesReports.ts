import { prisma } from '../../config/prisma-client';
import {
  bucketByPeriod,
  fillPeriodGaps,
  groupByField,
  parseReferences,
  resolveDateRangePreset,
  splitCsvParam,
  type DateRangePreset,
} from './aggregation';

// All four Cases reports are project-scoped (span every suite in the project), matching how
// the existing per-project dashboard (reports/routes.ts's dashboardRouter) already aggregates
// across suites rather than requiring a suite to be picked first.

export async function getActivitySummary(projectId: string, query: Record<string, unknown>) {
  const preset = (typeof query.preset === 'string' ? query.preset : 'thisWeek') as DateRangePreset;
  const groupBy = query.groupBy === 'month' ? 'month' : query.groupBy === 'section' ? 'section' : 'day';
  const includeNew = query.includeNew !== 'false';
  const includeUpdated = query.includeUpdated !== 'false';
  const sectionIds = splitCsvParam(query.sectionIds);
  const { from, to } = resolveDateRangePreset(preset, new Date(), query.from as string | undefined, query.to as string | undefined);

  const cases = await prisma.testCase.findMany({
    where: {
      suite: { projectId },
      isDeleted: false,
      ...(sectionIds.length > 0 ? { sectionId: { in: sectionIds } } : {}),
    },
    select: { id: true, title: true, sectionId: true, createdAt: true, updatedAt: true, section: { select: { name: true } } },
  });

  const newCases = includeNew ? cases.filter((c) => c.createdAt >= from && c.createdAt <= to) : [];
  // "Updated" excludes rows whose updatedAt still equals createdAt (never actually edited since
  // creation) and excludes anything already counted as "new" in this window, matching
  // TestRail's own "new vs. updated (latest update only)" distinction.
  const updatedCases = includeUpdated
    ? cases.filter(
        (c) => c.updatedAt >= from && c.updatedAt <= to && c.updatedAt.getTime() !== c.createdAt.getTime() && !newCases.includes(c),
      )
    : [];

  const changeRows = [
    ...newCases.map((c) => ({ id: c.id, title: c.title, sectionId: c.sectionId, sectionName: c.section?.name ?? null, changeType: 'created' as const, at: c.createdAt })),
    ...updatedCases.map((c) => ({ id: c.id, title: c.title, sectionId: c.sectionId, sectionName: c.section?.name ?? null, changeType: 'updated' as const, at: c.updatedAt })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  if (groupBy === 'section') {
    const bySection = new Map<string, { sectionId: string | null; sectionName: string; created: number; updated: number }>();
    for (const row of changeRows) {
      const key = row.sectionId ?? 'none';
      const entry = bySection.get(key) ?? { sectionId: row.sectionId, sectionName: row.sectionName ?? 'No section', created: 0, updated: 0 };
      if (row.changeType === 'created') entry.created++;
      else entry.updated++;
      bySection.set(key, entry);
    }
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy,
      newCount: newCases.length,
      updatedCount: updatedCases.length,
      groups: [...bySection.values()],
      cases: changeRows,
    };
  }

  const period = groupBy === 'month' ? 'month' : 'day';
  const createdBuckets = fillPeriodGaps(bucketByPeriod(newCases, (c) => c.createdAt, period), from, to, period);
  const updatedBuckets = fillPeriodGaps(bucketByPeriod(updatedCases, (c) => c.updatedAt, period), from, to, period);
  const periods = [...new Set([...createdBuckets.map((b) => b.period), ...updatedBuckets.map((b) => b.period)])].sort();
  const series = periods.map((p) => ({
    period: p,
    created: createdBuckets.find((b) => b.period === p)?.count ?? 0,
    updated: updatedBuckets.find((b) => b.period === p)?.count ?? 0,
  }));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    groupBy,
    newCount: newCases.length,
    updatedCount: updatedCases.length,
    series,
    cases: changeRows,
  };
}

export async function getCoverageForReferences(projectId: string, query: Record<string, unknown>) {
  const sectionIds = splitCsvParam(query.sectionIds);
  const includeWithRefs = query.includeWithRefs !== 'false';
  const includeWithoutRefs = query.includeWithoutRefs !== 'false';
  // "all" (default) covers every reference in use; a specific list restricts the report to
  // only those reference IDs, matching TestRail's "All references" vs. pasted-ID-list toggle.
  const specificRefs = splitCsvParam(query.referenceIds);

  const cases = await prisma.testCase.findMany({
    where: {
      suite: { projectId },
      isDeleted: false,
      ...(sectionIds.length > 0 ? { sectionId: { in: sectionIds } } : {}),
    },
    select: { id: true, title: true, sectionId: true, referenceLink: true, priority: true },
  });

  const withRefs = cases.filter((c) => parseReferences(c.referenceLink).length > 0);
  const withoutRefs = cases.filter((c) => parseReferences(c.referenceLink).length === 0);

  const byReference = new Map<string, { reference: string; cases: { id: string; title: string; priority: string }[] }>();
  for (const c of withRefs) {
    for (const ref of parseReferences(c.referenceLink)) {
      if (specificRefs.length > 0 && !specificRefs.includes(ref)) continue;
      const entry = byReference.get(ref) ?? { reference: ref, cases: [] };
      entry.cases.push({ id: c.id, title: c.title, priority: c.priority });
      byReference.set(ref, entry);
    }
  }

  const total = cases.length;
  const coveredCount = withRefs.length;

  return {
    total,
    coveredCount,
    uncoveredCount: withoutRefs.length,
    coveragePercent: total > 0 ? coveredCount / total : 0,
    references: [...byReference.values()].sort((a, b) => b.cases.length - a.cases.length),
    casesWithReferences: includeWithRefs ? withRefs.map((c) => ({ id: c.id, title: c.title, referenceLink: c.referenceLink })) : [],
    casesWithoutReferences: includeWithoutRefs ? withoutRefs.map((c) => ({ id: c.id, title: c.title })) : [],
  };
}

const DISTRIBUTION_FIELDS = ['priority', 'type', 'template', 'createdBy'] as const;
type DistributionField = (typeof DISTRIBUTION_FIELDS)[number];

export async function getCasePropertyDistribution(projectId: string, query: Record<string, unknown>) {
  const groupByRaw = typeof query.groupBy === 'string' ? query.groupBy : 'priority';
  const groupBy: DistributionField = (DISTRIBUTION_FIELDS as readonly string[]).includes(groupByRaw)
    ? (groupByRaw as DistributionField)
    : 'priority';
  const sectionIds = splitCsvParam(query.sectionIds);

  const cases = await prisma.testCase.findMany({
    where: {
      suite: { projectId },
      isDeleted: false,
      ...(sectionIds.length > 0 ? { sectionId: { in: sectionIds } } : {}),
    },
    select: { id: true, title: true, priority: true, type: true, template: true, createdBy: { select: { name: true } } },
  });

  const getField = (c: (typeof cases)[number]): string => {
    if (groupBy === 'priority') return c.priority;
    if (groupBy === 'type') return c.type;
    if (groupBy === 'template') return c.template;
    return c.createdBy?.name ?? 'Unknown';
  };

  return {
    groupBy,
    total: cases.length,
    buckets: groupByField(cases, getField),
  };
}

export async function getStatusTops(projectId: string, query: Record<string, unknown>) {
  const runIds = splitCsvParam(query.runIds);
  const sectionIds = splitCsvParam(query.sectionIds);
  const latestOnly = query.latestOnly !== 'false';
  const statuses = splitCsvParam(query.statuses);

  const runs = runIds.length > 0
    ? await prisma.testRun.findMany({ where: { id: { in: runIds }, projectId }, select: { id: true, name: true, isCompleted: true } })
    : await prisma.testRun.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, name: true, isCompleted: true } });
  const scopedRunIds = runs.map((r) => r.id);

  const runCases = await prisma.runCase.findMany({
    where: {
      runId: { in: scopedRunIds },
      caseId: { not: null },
      ...(sectionIds.length > 0 ? { case: { sectionId: { in: sectionIds } } } : {}),
    },
    // updatedAt (bumped by results/routes.ts on every result submission), not createdAt (frozen
    // at run-creation time) — "latest test result" should track when a result was last entered,
    // not which run happened to be created most recently.
    select: { caseId: true, runId: true, status: true, titleSnapshot: true, priority: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  // "Latest test result per test only" — one row per case, keeping only its most recent
  // RunCase among the selected runs. A real bug lived here: `new Map(pairs)` keeps the LAST
  // occurrence of a duplicate key, not the first — since `runCases` is already sorted
  // newest-first, that construction silently kept each case's OLDEST row, exactly backwards
  // from "latest," and was the report's actual default behavior (latestOnly defaults to true).
  // Explicit first-write-wins on the pre-sorted array fixes it.
  const rows = latestOnly
    ? (() => {
        const seen = new Map<string, (typeof runCases)[number]>();
        for (const rc of runCases) {
          if (rc.caseId && !seen.has(rc.caseId)) seen.set(rc.caseId, rc);
        }
        return [...seen.values()];
      })()
    : runCases;

  const filtered = statuses.length > 0 ? rows.filter((r) => statuses.includes(r.status)) : rows;

  return {
    runs,
    latestOnly,
    total: filtered.length,
    buckets: groupByField(filtered, (r) => r.status),
    cases: filtered.map((r) => ({ caseId: r.caseId, title: r.titleSnapshot, priority: r.priority, status: r.status, runId: r.runId })),
  };
}
