import { apiFetch } from '../lib/apiClient';

export interface Milestone {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  description: string | null;
  startDate: string | null;
  dueDate: string | null;
  references: string | null;
  isCompleted: boolean;
  completedAt: string | null;
}

export function listMilestones(projectId: string) {
  return apiFetch<{ milestones: Milestone[] }>(`/projects/${projectId}/milestones`);
}

export function createMilestone(
  projectId: string,
  input: { name: string; description?: string; startDate?: string; dueDate?: string; references?: string; parentId?: string },
) {
  return apiFetch<{ milestone: Milestone }>(`/projects/${projectId}/milestones`, { method: 'POST', body: input });
}

export function updateMilestone(
  id: string,
  input: { isCompleted?: boolean; name?: string; startDate?: string | null; dueDate?: string | null; references?: string },
) {
  return apiFetch<{ milestone: Milestone }>(`/milestones/${id}`, { method: 'PATCH', body: input });
}

export function deleteMilestone(id: string) {
  return apiFetch<void>(`/milestones/${id}`, { method: 'DELETE' });
}

export function getMilestoneDeleteImpact(id: string) {
  return apiFetch<{ planCount: number; runCount: number; childMilestoneCount: number }>(`/milestones/${id}/delete-impact`);
}
