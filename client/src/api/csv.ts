import { apiFetch } from '../lib/apiClient';
import { getAccessToken } from '../lib/tokenStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export function importCasesCsv(suiteId: string, csv: string) {
  return apiFetch<{ imported: number }>(`/suites/${suiteId}/cases/import`, { method: 'POST', body: { csv } });
}

export async function downloadCasesCsv(
  suiteId: string,
  suiteName: string,
  options?: { sectionIds?: string[]; columns?: string[] },
) {
  const params = new URLSearchParams();
  if (options?.sectionIds?.length) params.set('sectionIds', options.sectionIds.join(','));
  if (options?.columns?.length) params.set('columns', options.columns.join(','));
  const qs = params.toString();
  const res = await fetch(`${BASE_URL}/suites/${suiteId}/cases/export${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
    headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
  });
  if (!res.ok) throw new Error('Failed to export cases');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${suiteName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-cases.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importFeatureFile(suiteId: string, featureText: string) {
  return apiFetch<{ imported: number; sectionName: string }>(`/suites/${suiteId}/cases/import-feature`, {
    method: 'POST',
    body: { featureText },
  });
}

export async function downloadFeatureFile(suiteId: string, suiteName: string) {
  const res = await fetch(`${BASE_URL}/suites/${suiteId}/cases/export-feature`, {
    credentials: 'include',
    headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
  });
  if (!res.ok) throw new Error('Failed to export .feature file');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${suiteName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.feature`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
