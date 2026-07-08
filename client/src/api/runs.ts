import { apiFetch } from '../lib/apiClient';
import type { Priority } from './types';

export interface TestRun {
  id: string;
  projectId: string;
  suiteId: string | null;
  name: string;
  description: string | null;
  configLabel: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  suite?: { name: string } | null;
  _count?: { runCases: number };
}

export type ResultStatus = 'UNTESTED' | 'PASSED' | 'FAILED' | 'BLOCKED' | 'RETEST';

export interface RunCase {
  id: string;
  runId: string;
  caseId: string | null;
  titleSnapshot: string;
  stepsSnapshot: { step: string; expected?: string }[] | null;
  expectedSnapshot: string | null;
  priority: Priority;
  status: ResultStatus;
  assignedTo: { id: string; name: string } | null;
}

export interface RunSummary {
  counts: Record<ResultStatus, number>;
  total: number;
}

export interface Result {
  id: string;
  status: ResultStatus;
  comment: string | null;
  defects: string | null;
  elapsedMs: number | null;
  createdAt: string;
  enteredBy: { id: string; name: string } | null;
}

export function listRuns(projectId: string) {
  return apiFetch<{ runs: TestRun[] }>(`/projects/${projectId}/runs`);
}

export function createRun(projectId: string, input: { name: string; description?: string; suiteId: string; caseIds?: string[] }) {
  return apiFetch<{ run: TestRun }>(`/projects/${projectId}/runs`, { method: 'POST', body: input });
}

export function getRun(id: string) {
  return apiFetch<{ run: TestRun }>(`/runs/${id}`);
}

export function closeRun(id: string) {
  return apiFetch<{ run: TestRun }>(`/runs/${id}/close`, { method: 'POST' });
}

export function listTests(runId: string) {
  return apiFetch<{ tests: RunCase[] }>(`/runs/${runId}/tests`);
}

export function getRunSummary(runId: string) {
  return apiFetch<RunSummary>(`/runs/${runId}/summary`);
}

export function listResults(testId: string) {
  return apiFetch<{ results: Result[] }>(`/tests/${testId}/results`);
}

export function submitResult(testId: string, input: { status: ResultStatus; comment?: string; defects?: string }) {
  return apiFetch<{ result: Result }>(`/tests/${testId}/results`, { method: 'POST', body: input });
}

export function reassignTest(testId: string, assignedToId: string | null) {
  return apiFetch<{ test: RunCase }>(`/tests/${testId}`, { method: 'PATCH', body: { assignedToId } });
}
