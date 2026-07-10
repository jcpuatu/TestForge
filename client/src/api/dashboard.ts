import { apiFetch } from '../lib/apiClient';

export interface StatusCounts {
  UNTESTED: number;
  PASSED: number;
  FAILED: number;
  BLOCKED: number;
  RETEST: number;
}

export interface ProjectDashboardEntry {
  id: string;
  name: string;
  isCompleted: boolean;
  counts: { suites: number; cases: number; runs: number; milestones: number };
  statusCounts: StatusCounts;
  total: number;
}

export interface CrossProjectDashboard {
  counts: { projects: number; suites: number; cases: number; runs: number; milestones: number };
  totals: StatusCounts;
  passRate: number | null;
  projects: ProjectDashboardEntry[];
}

export function getCrossProjectDashboard() {
  return apiFetch<CrossProjectDashboard>('/dashboard');
}
