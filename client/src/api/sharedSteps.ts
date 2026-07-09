import { apiFetch } from '../lib/apiClient';
import type { CaseStep, SharedStepSet } from './types';

export function listSharedStepSets(projectId: string) {
  return apiFetch<{ sharedStepSets: SharedStepSet[] }>(`/projects/${projectId}/shared-step-sets`);
}

export function createSharedStepSet(projectId: string, name: string, steps: CaseStep[]) {
  return apiFetch<{ sharedStepSet: SharedStepSet }>(`/projects/${projectId}/shared-step-sets`, {
    method: 'POST',
    body: { name, steps },
  });
}

export function updateSharedStepSet(id: string, fields: { name?: string; steps?: CaseStep[] }) {
  return apiFetch<{ sharedStepSet: SharedStepSet }>(`/shared-step-sets/${id}`, { method: 'PATCH', body: fields });
}

export function getSharedStepSetDeleteImpact(id: string) {
  return apiFetch<{ caseCount: number }>(`/shared-step-sets/${id}/delete-impact`);
}

export function deleteSharedStepSet(id: string) {
  return apiFetch<void>(`/shared-step-sets/${id}`, { method: 'DELETE' });
}

export function promoteCaseSteps(caseId: string, name: string) {
  return apiFetch<{ sharedStepSet: SharedStepSet }>(`/cases/${caseId}/promote-shared-steps`, {
    method: 'POST',
    body: { name },
  });
}
