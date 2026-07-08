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
