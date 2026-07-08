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

export function listCasesBySection(sectionId: string) {
  return apiFetch<{ cases: TestCase[] }>(`/sections/${sectionId}/cases`);
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
