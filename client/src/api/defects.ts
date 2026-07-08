import { apiFetch } from '../lib/apiClient';
import { getAccessToken } from '../lib/tokenStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export interface DefectEntry {
  id: string;
  count: number;
  openCount: number;
  resolvedCount: number;
  lastSeenAt: string;
  cases: { caseTitle: string; runId: string; runName: string; status: string }[];
}

export function listProjectDefects(projectId: string) {
  return apiFetch<{ defects: DefectEntry[] }>(`/projects/${projectId}/defects`);
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
