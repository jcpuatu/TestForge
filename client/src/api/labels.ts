import { apiFetch } from '../lib/apiClient';
import type { Label } from './types';

export function listLabels(projectId: string) {
  return apiFetch<{ labels: Label[] }>(`/projects/${projectId}/labels`);
}

export function createLabel(projectId: string, name: string) {
  return apiFetch<{ label: Label }>(`/projects/${projectId}/labels`, { method: 'POST', body: { name } });
}

export function updateLabel(id: string, name: string) {
  return apiFetch<{ label: Label }>(`/labels/${id}`, { method: 'PATCH', body: { name } });
}

export function deleteLabel(id: string) {
  return apiFetch<void>(`/labels/${id}`, { method: 'DELETE' });
}
