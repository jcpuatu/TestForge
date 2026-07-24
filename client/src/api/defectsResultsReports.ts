import { apiFetch } from '../lib/apiClient';
import type { Priority } from './types';

export interface ReportRun {
  id: string;
  name: string;
  isCompleted: boolean;
}

interface RunScopedFilter {
  runIds?: string[];
  sectionIds?: string[];
}

function buildQuery(params: Record<string, string | string[] | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) usp.set(key, value.join(','));
    } else {
      usp.set(key, value);
    }
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

// ── Defects Reports ──────────────────────────────────────────────────────

export interface DefectEntry {
  id: string;
  count: number;
  openCount: number;
  resolvedCount: number;
  lastSeenAt: string;
  cases: { caseId: string | null; caseTitle: string; runId: string; runName: string; status: string }[];
}

export function getDefectsSummary(projectId: string, filter: RunScopedFilter) {
  const qs = buildQuery({ runIds: filter.runIds });
  return apiFetch<{ runs: ReportRun[]; defects: DefectEntry[] }>(`/projects/${projectId}/reports/defects/summary${qs}`);
}

export interface DefectsMatrixCase {
  caseId: string;
  title: string;
  priority: Priority;
  cells: { runId: string; status: string | null; defects: string[] }[];
}

export function getDefectsSummaryForCases(projectId: string, filter: RunScopedFilter) {
  const qs = buildQuery({ runIds: filter.runIds, sectionIds: filter.sectionIds });
  return apiFetch<{ runs: ReportRun[]; cases: DefectsMatrixCase[] }>(`/projects/${projectId}/reports/defects/summary-for-cases${qs}`);
}

export function getDefectsSummaryForReferences(projectId: string, filter: RunScopedFilter) {
  const qs = buildQuery({ runIds: filter.runIds, sectionIds: filter.sectionIds });
  return apiFetch<{ runs: ReportRun[]; references: { reference: string; cases: DefectsMatrixCase[] }[] }>(
    `/projects/${projectId}/reports/defects/summary-for-references${qs}`,
  );
}

// ── Results Reports ──────────────────────────────────────────────────────

export interface ComparisonCase {
  caseId: string;
  title: string;
  priority: Priority;
  cells: { runId: string; status: string | null }[];
}

export function getComparisonForCases(projectId: string, filter: RunScopedFilter) {
  const qs = buildQuery({ runIds: filter.runIds, sectionIds: filter.sectionIds });
  return apiFetch<{ runs: ReportRun[]; cases: ComparisonCase[] }>(`/projects/${projectId}/reports/results/comparison-for-cases${qs}`);
}

export function getComparisonForReferences(projectId: string, filter: RunScopedFilter) {
  const qs = buildQuery({ runIds: filter.runIds, sectionIds: filter.sectionIds });
  return apiFetch<{ runs: ReportRun[]; references: { reference: string; cases: ComparisonCase[] }[] }>(
    `/projects/${projectId}/reports/results/comparison-for-references${qs}`,
  );
}

export interface DistributionBucket {
  value: string;
  count: number;
  percent: number;
}

export function getResultPropertyDistribution(projectId: string, filter: { runIds?: string[]; groupBy?: 'status' | 'type' | 'assignedTo' | 'template' }) {
  const qs = buildQuery({ runIds: filter.runIds, groupBy: filter.groupBy });
  return apiFetch<{ runs: ReportRun[]; groupBy: string; total: number; buckets: DistributionBucket[] }>(
    `/projects/${projectId}/reports/results/property-distribution${qs}`,
  );
}
