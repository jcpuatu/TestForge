import { apiFetch } from '../lib/apiClient';

export interface Milestone {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  description: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  completedAt: string | null;
}

export function listMilestones(projectId: string) {
  return apiFetch<{ milestones: Milestone[] }>(`/projects/${projectId}/milestones`);
}

export function createMilestone(projectId: string, input: { name: string; description?: string; dueDate?: string }) {
  return apiFetch<{ milestone: Milestone }>(`/projects/${projectId}/milestones`, { method: 'POST', body: input });
}

export function updateMilestone(id: string, input: { isCompleted?: boolean; name?: string; dueDate?: string | null }) {
  return apiFetch<{ milestone: Milestone }>(`/milestones/${id}`, { method: 'PATCH', body: input });
}

export function deleteMilestone(id: string) {
  return apiFetch<void>(`/milestones/${id}`, { method: 'DELETE' });
}
