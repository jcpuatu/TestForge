import { apiFetch } from '../lib/apiClient';
import { getAccessToken } from '../lib/tokenStore';
import type { PaginationMeta } from './pagination';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export interface DefectEntry {
  id: string;
  count: number;
  openCount: number;
  resolvedCount: number;
  lastSeenAt: string;
  // cases[] is capped server-side (MAX_CASES_PER_DEFECT) -- casesTotal is the real occurrence
  // count when a defect recurs more often than that cap.
  casesTotal: number;
  cases: { caseTitle: string; runId: string; runName: string; status: string }[];
}

export interface ProjectDefectsResult {
  defects: DefectEntry[];
  // The runs this rollup was actually scoped to -- defaults to the 25 most recent when no
  // runIds filter is passed, matching every sibling Defects/Results report's convention.
  runs: { id: string; name: string; isCompleted: boolean }[];
}

export function listProjectDefects(projectId: string, opts?: { runIds?: string[]; page?: number; pageSize?: number }) {
  const params = new URLSearchParams();
  if (opts?.runIds?.length) params.set('runIds', opts.runIds.join(','));
  params.set('page', String(opts?.page ?? 1));
  if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
  return apiFetch<ProjectDefectsResult & PaginationMeta>(`/projects/${projectId}/defects?${params.toString()}`);
}

export async function downloadDefectsCsv(runId: string, runName: string) {
  const res = await fetch(`${BASE_URL}/runs/${runId}/defects/export`, {
    credentials: 'include',
    headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
  });
  if (!res.ok) throw new Error('Failed to export defects');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${runName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-defects.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
