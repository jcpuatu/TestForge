import { apiFetch } from '../lib/apiClient';
import type { ResultStatus } from './runs';

export interface CaseTimelineEntry {
  runId: string;
  runName: string;
  isCompleted: boolean;
  status: ResultStatus;
  defects: string | null;
  resultDate: string | null;
}

export interface CaseDefectEntry {
  id: string;
  count: number;
  openCount: number;
  lastSeenAt: string;
  runs: { runId: string; runName: string }[];
}

export interface CaseHistory {
  case: { id: string; title: string };
  timeline: CaseTimelineEntry[];
  defects: CaseDefectEntry[];
}

export function getCaseHistory(caseId: string) {
  return apiFetch<CaseHistory>(`/cases/${caseId}/history`);
}
