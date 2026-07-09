import { apiFetch } from '../lib/apiClient';
import type { CaseStep, CaseType, Priority, TestCase } from './types';

export interface CaseInput {
  title: string;
  preconditions?: string;
  steps?: CaseStep[];
  expectedResult?: string;
  priority?: Priority;
  type?: CaseType;
  estimate?: string;
  referenceLink?: string;
}

export function listCasesBySuite(suiteId: string) {
  return apiFetch<{ cases: TestCase[] }>(`/suites/${suiteId}/cases`);
}

export function listCasesBySection(sectionId: string, opts?: { deleted?: boolean }) {
  const query = opts?.deleted ? '?deleted=true' : '';
  return apiFetch<{ cases: TestCase[] }>(`/sections/${sectionId}/cases${query}`);
}

export function getCase(id: string) {
  return apiFetch<{ case: TestCase }>(`/cases/${id}`);
}

export function createCase(sectionId: string, input: CaseInput) {
  return apiFetch<{ case: TestCase }>(`/sections/${sectionId}/cases`, { method: 'POST', body: input });
}

export function updateCase(id: string, input: Partial<CaseInput>) {
  return apiFetch<{ case: TestCase }>(`/cases/${id}`, { method: 'PATCH', body: input });
}

export function deleteCase(id: string) {
  return apiFetch<void>(`/cases/${id}`, { method: 'DELETE' });
}

export function restoreCase(id: string) {
  return apiFetch<{ case: TestCase }>(`/cases/${id}/restore`, { method: 'POST' });
}

export function bulkRestoreCases(caseIds: string[]) {
  return apiFetch<{ restored: number }>('/cases/bulk-restore', { method: 'POST', body: { caseIds } });
}

export function permanentlyDeleteCase(id: string) {
  return apiFetch<void>(`/cases/${id}/permanent`, { method: 'DELETE' });
}
