import { prisma } from '../../config/prisma-client';
import { groupByField, parseReferences, splitCsvParam } from './aggregation';
import { buildCasesRunsMatrix, resolveRunIds } from './runsMatrix';

export interface ComparisonCase {
  caseId: string;
  title: string;
  priority: string;
  cells: { runId: string; status: string | null }[];
}

export async function getComparisonForCases(projectId: string, query: Record<string, unknown>) {
  const runIds = splitCsvParam(query.runIds);
  const sectionIds = splitCsvParam(query.sectionIds);
  const runs = await resolveRunIds(projectId, runIds);
  const scopedRunIds = runs.map((r) => r.id);
  const matrix = await buildCasesRunsMatrix(scopedRunIds, sectionIds);

  const cases: ComparisonCase[] = matrix.map((row) => ({
    caseId: row.caseId,
    title: row.title,
    priority: row.priority,
    cells: scopedRunIds.map((runId) => ({ runId, status: row.cells.get(runId)?.status ?? null })),
  }));

  return { runs, cases };
}

export async function getComparisonForReferences(projectId: string, query: Record<string, unknown>) {
  const runIds = splitCsvParam(query.runIds);
  const sectionIds = splitCsvParam(query.sectionIds);
  const runs = await resolveRunIds(projectId, runIds);
  const scopedRunIds = runs.map((r) => r.id);
  const matrix = await buildCasesRunsMatrix(scopedRunIds, sectionIds);

  const byReference = new Map<string, { reference: string; cases: ComparisonCase[] }>();
  for (const row of matrix) {
    if (!row.referenceLink) continue;
    const caseRow: ComparisonCase = {
      caseId: row.caseId,
      title: row.title,
      priority: row.priority,
      cells: scopedRunIds.map((runId) => ({ runId, status: row.cells.get(runId)?.status ?? null })),
    };
    for (const ref of parseReferences(row.referenceLink)) {
      const entry = byReference.get(ref) ?? { reference: ref, cases: [] };
      entry.cases.push(caseRow);
      byReference.set(ref, entry);
    }
  }

  return { runs, references: [...byReference.values()] };
}

const RESULT_DISTRIBUTION_FIELDS = ['status', 'type', 'assignedTo', 'template'] as const;
type ResultDistributionField = (typeof RESULT_DISTRIBUTION_FIELDS)[number];

export async function getResultPropertyDistribution(projectId: string, query: Record<string, unknown>) {
  const runIds = splitCsvParam(query.runIds);
  const groupByRaw = typeof query.groupBy === 'string' ? query.groupBy : 'status';
  const groupBy: ResultDistributionField = (RESULT_DISTRIBUTION_FIELDS as readonly string[]).includes(groupByRaw)
    ? (groupByRaw as ResultDistributionField)
    : 'status';

  const runs = await resolveRunIds(projectId, runIds);
  const scopedRunIds = runs.map((r) => r.id);

  const tests = await prisma.runCase.findMany({
    where: { runId: { in: scopedRunIds } },
    select: { status: true, templateSnapshot: true, assignedTo: { select: { name: true } }, case: { select: { type: true } } },
  });

  // "Type" has no RunCase snapshot field (unlike template/priority) — falls back to the live
  // TestCase.type via the relation, matching the fact that this is the one property distinct
  // enough from the snapshot fields that TestRail groups Results by it anyway.
  const getField = (t: (typeof tests)[number]): string => {
    if (groupBy === 'status') return t.status;
    if (groupBy === 'template') return t.templateSnapshot;
    if (groupBy === 'assignedTo') return t.assignedTo?.name ?? 'Unassigned';
    return t.case?.type ?? 'Unknown';
  };

  return { runs, groupBy, total: tests.length, buckets: groupByField(tests, getField) };
}
