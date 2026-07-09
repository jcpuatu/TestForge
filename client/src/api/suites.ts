import { apiFetch } from '../lib/apiClient';
import type { Section, Suite } from './types';

export function listSuites(projectId: string) {
  return apiFetch<{ suites: Suite[] }>(`/projects/${projectId}/suites`);
}

export function getSuite(id: string) {
  return apiFetch<{ suite: Suite & { sections: Section[] } }>(`/suites/${id}`);
}

export function createSuite(projectId: string, input: { name: string; description?: string }) {
  return apiFetch<{ suite: Suite }>(`/projects/${projectId}/suites`, { method: 'POST', body: input });
}

export function updateSuite(id: string, input: { name?: string; description?: string }) {
  return apiFetch<{ suite: Suite }>(`/suites/${id}`, { method: 'PATCH', body: input });
}

export function deleteSuite(id: string) {
  return apiFetch<void>(`/suites/${id}`, { method: 'DELETE' });
}

export function getSuiteDeleteImpact(id: string) {
  return apiFetch<{ caseCount: number; activeRunCount: number; closedRunCount: number }>(`/suites/${id}/delete-impact`);
}

export function listSections(suiteId: string) {
  return apiFetch<{ sections: Section[] }>(`/suites/${suiteId}/sections`);
}

export function updateSection(id: string, input: { name?: string; description?: string }) {
  return apiFetch<{ section: Section }>(`/sections/${id}`, { method: 'PATCH', body: input });
}

export function deleteSection(id: string) {
  return apiFetch<void>(`/sections/${id}`, { method: 'DELETE' });
}

export function getSectionDeleteImpact(id: string) {
  return apiFetch<{ caseCount: number; subsectionCount: number }>(`/sections/${id}/delete-impact`);
}

export function createSection(suiteId: string, input: { name: string; description?: string; parentId?: string }) {
  return apiFetch<{ section: Section }>(`/suites/${suiteId}/sections`, { method: 'POST', body: input });
}

export function moveSection(id: string, parentId: string | null, orderIndex: number) {
  return apiFetch<{ sections: Section[] }>(`/sections/${id}/move`, { method: 'POST', body: { parentId, orderIndex } });
}
