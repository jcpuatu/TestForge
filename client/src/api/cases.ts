import { apiFetch } from '../lib/apiClient';
import type { BddLine, CaseStep, CaseTemplate, CaseType, Priority, TestCase } from './types';

export interface CaseInput {
  title: string;
  template?: CaseTemplate;
  preconditions?: string;
  steps?: CaseStep[];
  expectedResult?: string;
  mission?: string;
  goals?: string;
  bddLines?: BddLine[];
  priority?: Priority;
  type?: CaseType;
  estimate?: string;
  referenceLink?: string;
  labelIds?: string[];
  sharedStepSetIds?: string[];
}

export interface CaseFilter {
  sectionIds?: string[];
  priorities?: Priority[];
  types?: CaseType[];
  createdByIds?: string[];
  labelIds?: string[];
  createdAfter?: string;
  createdBefore?: string;
  match?: 'all' | 'any';
  sortBy?: 'title' | 'priority' | 'type' | 'createdAt' | 'orderIndex';
  sortDir?: 'asc' | 'desc';
  deleted?: boolean;
}

export function isFilterActive(filter: CaseFilter): boolean {
  return !!(
    filter.sectionIds?.length ||
    filter.priorities?.length ||
    filter.types?.length ||
    filter.createdByIds?.length ||
    filter.labelIds?.length ||
    filter.createdAfter ||
    filter.createdBefore
  );
}

export function listCasesBySuite(suiteId: string, filter?: CaseFilter) {
  const params = new URLSearchParams();
  if (filter?.sectionIds?.length) params.set('sectionIds', filter.sectionIds.join(','));
  if (filter?.priorities?.length) params.set('priorities', filter.priorities.join(','));
  if (filter?.types?.length) params.set('types', filter.types.join(','));
  if (filter?.createdByIds?.length) params.set('createdByIds', filter.createdByIds.join(','));
  if (filter?.labelIds?.length) params.set('labelIds', filter.labelIds.join(','));
  if (filter?.createdAfter) params.set('createdAfter', filter.createdAfter);
  if (filter?.createdBefore) params.set('createdBefore', filter.createdBefore);
  if (filter?.match) params.set('match', filter.match);
  if (filter?.sortBy) params.set('sortBy', filter.sortBy);
  if (filter?.sortDir) params.set('sortDir', filter.sortDir);
  if (filter?.deleted) params.set('deleted', 'true');
  const query = params.toString();
  return apiFetch<{ cases: TestCase[] }>(`/suites/${suiteId}/cases${query ? `?${query}` : ''}`);
}

export function listCasesBySection(sectionId: string, opts?: { deleted?: boolean; sortBy?: CaseFilter['sortBy']; sortDir?: CaseFilter['sortDir'] }) {
  const params = new URLSearchParams();
  if (opts?.deleted) params.set('deleted', 'true');
  if (opts?.sortBy) params.set('sortBy', opts.sortBy);
  if (opts?.sortDir) params.set('sortDir', opts.sortDir);
  const query = params.toString();
  return apiFetch<{ cases: TestCase[] }>(`/sections/${sectionId}/cases${query ? `?${query}` : ''}`);
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

export function bulkDeleteCases(caseIds: string[]) {
  return apiFetch<{ deleted: number }>('/cases/bulk-delete', { method: 'POST', body: { caseIds } });
}

export function bulkUpdateCases(caseIds: string[], fields: { priority?: Priority; type?: CaseType; sectionId?: string }) {
  return apiFetch<{ updated: number }>('/cases/bulk-update', { method: 'PATCH', body: { caseIds, ...fields } });
}

export function bulkAddLabels(caseIds: string[], labelIds: string[]) {
  return apiFetch<{ updated: number }>('/cases/bulk-add-labels', { method: 'POST', body: { caseIds, labelIds } });
}
