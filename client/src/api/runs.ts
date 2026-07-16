import { apiFetch } from '../lib/apiClient';
import type { BddLine, CaseTemplate, Priority } from './types';

export interface TestRun {
  id: string;
  projectId: string;
  suiteId: string | null;
  name: string;
  description: string | null;
  configLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  suite?: { name: string } | null;
  plan?:
    | {
        id: string;
        name: string;
        startDate: string | null;
        endDate: string | null;
        milestone?: { id: string; name: string; startDate: string | null; dueDate: string | null } | null;
      }
    | null;
  milestone?: { id: string; name: string; startDate: string | null; dueDate: string | null } | null;
  _count?: { runCases: number };
  // Present on the list endpoint only (GET /projects/:id/runs) — a per-run status breakdown so
  // the Runs list can show a pass/fail bar without a click-through, matching what the Overview
  // dashboard's "Recent runs" widget already shows.
  counts?: Record<ResultStatus, number>;
  total?: number;
}

export type ResultStatus = 'UNTESTED' | 'PASSED' | 'FAILED' | 'BLOCKED' | 'RETEST';

export interface RunCase {
  id: string;
  runId: string;
  caseId: string | null;
  titleSnapshot: string;
  templateSnapshot: CaseTemplate;
  stepsSnapshot: { step: string; expected?: string }[] | null;
  expectedSnapshot: string | null;
  missionSnapshot: string | null;
  goalsSnapshot: string | null;
  bddLinesSnapshot: BddLine[] | null;
  priority: Priority;
  status: ResultStatus;
  assignedToId: string | null;
  assignedTo: { id: string; name: string } | null;
  latestDefects: string | null;
  latestComment: string | null;
}

export interface RunSummary {
  counts: Record<ResultStatus, number>;
  total: number;
}

export interface StepResult {
  status: ResultStatus;
  actual?: string;
}

export interface Result {
  id: string;
  status: ResultStatus;
  comment: string | null;
  defects: string | null;
  version: string | null;
  elapsedMs: number | null;
  stepResults: StepResult[] | null;
  createdAt: string;
  enteredBy: { id: string; name: string } | null;
}

export function listRuns(projectId: string) {
  return apiFetch<{ runs: TestRun[] }>(`/projects/${projectId}/runs`);
}

export function createRun(
  projectId: string,
  input: {
    name: string;
    description?: string;
    suiteId: string;
    startDate?: string;
    endDate?: string;
    caseIds?: string[];
    assignedToId?: string;
  },
) {
  return apiFetch<{ run: TestRun }>(`/projects/${projectId}/runs`, { method: 'POST', body: input });
}

export function getRun(id: string) {
  return apiFetch<{ run: TestRun }>(`/runs/${id}`);
}

export function updateRun(
  id: string,
  input: { name?: string; description?: string; startDate?: string | null; endDate?: string | null; assignedToId?: string | null },
) {
  return apiFetch<{ run: TestRun }>(`/runs/${id}`, { method: 'PATCH', body: input });
}

export function rerunRun(id: string, input: { statuses: ResultStatus[]; copyAssignees: boolean; name?: string }) {
  return apiFetch<{ run: TestRun }>(`/runs/${id}/rerun`, { method: 'POST', body: input });
}

export function closeRun(id: string) {
  return apiFetch<{ run: TestRun }>(`/runs/${id}/close`, { method: 'POST' });
}

export function reopenRun(id: string) {
  return apiFetch<{ run: TestRun }>(`/runs/${id}/reopen`, { method: 'POST' });
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

export function submitResult(
  testId: string,
  input: { status: ResultStatus; comment?: string; defects?: string; version?: string; elapsedMs?: number; stepResults?: StepResult[] },
) {
  return apiFetch<{ result: Result }>(`/tests/${testId}/results`, { method: 'POST', body: input });
}

export function reassignTest(testId: string, assignedToId: string | null) {
  return apiFetch<{ test: RunCase }>(`/tests/${testId}`, { method: 'PATCH', body: { assignedToId } });
}

export function bulkAssignTests(runId: string, testIds: string[], assignedToId: string | null) {
  return apiFetch<{ updated: number }>(`/runs/${runId}/tests/bulk-assign`, {
    method: 'POST',
    body: { testIds, assignedToId },
  });
}

export function bulkSubmitResults(runId: string, testIds: string[], status: ResultStatus, comment?: string) {
  return apiFetch<{ updated: number }>(`/runs/${runId}/tests/bulk-result`, {
    method: 'POST',
    body: { testIds, status, comment },
  });
}
