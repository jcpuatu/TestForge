import { apiFetch } from '../lib/apiClient';
import type { Project, Suite } from './types';

export function listProjects() {
  return apiFetch<{ projects: Project[] }>('/projects');
}

export function getProject(id: string) {
  return apiFetch<{ project: Project & { suites: Suite[] } }>(`/projects/${id}`);
}

export function createProject(input: { name: string; description?: string }) {
  return apiFetch<{ project: Project }>('/projects', { method: 'POST', body: input });
}

export function updateProject(id: string, input: { name?: string; description?: string }) {
  return apiFetch<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', body: input });
}

export function deleteProject(id: string) {
  return apiFetch<void>(`/projects/${id}`, { method: 'DELETE' });
}

export function getProjectDeleteImpact(id: string) {
  return apiFetch<{ suiteCount: number; caseCount: number; runCount: number; planCount: number; milestoneCount: number }>(
    `/projects/${id}/delete-impact`,
  );
}
