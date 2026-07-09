import { apiFetch } from '../lib/apiClient';
import type { TestRun } from './runs';

export interface TestPlan {
  id: string;
  projectId: string;
  milestoneId: string | null;
  name: string;
  description: string | null;
  isCompleted: boolean;
  createdAt: string;
  milestone?: { name: string } | null;
  _count?: { runs: number };
}

export function listPlans(projectId: string) {
  return apiFetch<{ plans: TestPlan[] }>(`/projects/${projectId}/plans`);
}

export function createPlan(projectId: string, input: { name: string; description?: string; milestoneId?: string }) {
  return apiFetch<{ plan: TestPlan }>(`/projects/${projectId}/plans`, { method: 'POST', body: input });
}

export function getPlan(id: string) {
  return apiFetch<{ plan: TestPlan & { runs: TestRun[] } }>(`/plans/${id}`);
}

export function updatePlan(id: string, input: { name?: string; description?: string; milestoneId?: string | null }) {
  return apiFetch<{ plan: TestPlan }>(`/plans/${id}`, { method: 'PATCH', body: input });
}

export function deletePlan(id: string) {
  return apiFetch<void>(`/plans/${id}`, { method: 'DELETE' });
}

export function createPlanRun(planId: string, input: { name: string; suiteId: string; caseIds?: string[] }) {
  return apiFetch<{ run: TestRun }>(`/plans/${planId}/runs`, { method: 'POST', body: input });
}
