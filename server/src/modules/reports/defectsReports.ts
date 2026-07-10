import { parseReferences, splitCsvParam } from './aggregation';
import { aggregateDefects, buildCasesRunsMatrixWithDefects, fetchLatestResultPerRunCase, resolveRunIds } from './runsMatrix';

export interface DefectsMatrixCase {
  caseId: string;
  title: string;
  priority: string;
  cells: { runId: string; status: string | null; defects: string[] }[];
}

export async function getDefectsSummary(projectId: string, query: Record<string, unknown>) {
  const runIds = splitCsvParam(query.runIds);
  const runs = await resolveRunIds(projectId, runIds);
  const scopedRunIds = runs.map((r) => r.id);
  const runCases = await fetchLatestResultPerRunCase({ runId: { in: scopedRunIds } });
  return { runs, defects: aggregateDefects(runCases) };
}

export async function getDefectsSummaryForCases(projectId: string, query: Record<string, unknown>) {
  const runIds = splitCsvParam(query.runIds);
  const sectionIds = splitCsvParam(query.sectionIds);
  const runs = await resolveRunIds(projectId, runIds);
  const scopedRunIds = runs.map((r) => r.id);
  const matrix = await buildCasesRunsMatrixWithDefects(scopedRunIds, sectionIds);

  const cases: DefectsMatrixCase[] = matrix
    .map((row) => ({
      caseId: row.caseId,
      title: row.title,
      priority: row.priority,
      cells: scopedRunIds.map((runId) => {
        const cell = row.cells.get(runId);
        return { runId, status: cell?.status ?? null, defects: cell?.defects ?? [] };
      }),
    }))
    .filter((row) => row.cells.some((c) => c.defects.length > 0));

  return { runs, cases };
}

export async function getDefectsSummaryForReferences(projectId: string, query: Record<string, unknown>) {
  const runIds = splitCsvParam(query.runIds);
  const sectionIds = splitCsvParam(query.sectionIds);
  const runs = await resolveRunIds(projectId, runIds);
  const scopedRunIds = runs.map((r) => r.id);
  const matrix = await buildCasesRunsMatrixWithDefects(scopedRunIds, sectionIds);

  const byReference = new Map<string, { reference: string; cases: DefectsMatrixCase[] }>();
  for (const row of matrix) {
    const hasDefects = [...row.cells.values()].some((c) => c.defects.length > 0);
    if (!hasDefects || !row.referenceLink) continue;

    const caseRow: DefectsMatrixCase = {
      caseId: row.caseId,
      title: row.title,
      priority: row.priority,
      cells: scopedRunIds.map((runId) => {
        const cell = row.cells.get(runId);
        return { runId, status: cell?.status ?? null, defects: cell?.defects ?? [] };
      }),
    };

    for (const ref of parseReferences(row.referenceLink)) {
      const entry = byReference.get(ref) ?? { reference: ref, cases: [] };
      entry.cases.push(caseRow);
      byReference.set(ref, entry);
    }
  }

  return { runs, references: [...byReference.values()] };
}
