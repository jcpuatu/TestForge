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

export function listSections(suiteId: string) {
  return apiFetch<{ sections: Section[] }>(`/suites/${suiteId}/sections`);
}

export function createSection(suiteId: string, input: { name: string; description?: string; parentId?: string }) {
  return apiFetch<{ section: Section }>(`/suites/${suiteId}/sections`, { method: 'POST', body: input });
}
