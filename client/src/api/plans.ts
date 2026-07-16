import { apiFetch } from '../lib/apiClient';
import type { ResultStatus, TestRun } from './runs';

export interface TestPlan {
  id: string;
  projectId: string;
  milestoneId: string | null;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  referenceId: string | null;
  isCompleted: boolean;
  createdAt: string;
  milestone?: { id: string; name: string; startDate: string | null; dueDate: string | null } | null;
  _count?: { runs: number };
}

export function listPlans(projectId: string) {
  return apiFetch<{ plans: TestPlan[] }>(`/projects/${projectId}/plans`);
}

export function createPlan(
  projectId: string,
  input: { name: string; description?: string; milestoneId?: string; startDate?: string; endDate?: string; referenceId?: string },
) {
  return apiFetch<{ plan: TestPlan }>(`/projects/${projectId}/plans`, { method: 'POST', body: input });
}

export function getPlan(id: string) {
  return apiFetch<{ plan: TestPlan & { runs: TestRun[] } }>(`/plans/${id}`);
}

export function updatePlan(
  id: string,
  input: { name?: string; description?: string; milestoneId?: string | null; startDate?: string | null; endDate?: string | null; referenceId?: string },
) {
  return apiFetch<{ plan: TestPlan }>(`/plans/${id}`, { method: 'PATCH', body: input });
}

export function deletePlan(id: string) {
  return apiFetch<void>(`/plans/${id}`, { method: 'DELETE' });
}

export function createPlanRun(planId: string, input: { name: string; suiteId: string; caseIds?: string[]; assignedToId?: string }) {
  return apiFetch<{ run: TestRun }>(`/plans/${planId}/runs`, { method: 'POST', body: input });
}

export interface RerunFailure {
  runId: string;
  runName: string;
  message: string;
}

export function rerunPlan(planId: string, input: { statuses: ResultStatus[]; copyAssignees: boolean }) {
  return apiFetch<{ runs: TestRun[]; skipped: number; failed: RerunFailure[] }>(`/plans/${planId}/rerun`, { method: 'POST', body: input });
}
