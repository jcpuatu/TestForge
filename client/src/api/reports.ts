import { apiFetch } from '../lib/apiClient';
import type { ResultStatus } from './runs';

export interface DashboardData {
  counts: { suites: number; cases: number; milestones: number; plans: number; runs: number };
  passRate: number | null;
  totals: Record<ResultStatus, number>;
  recentRuns: {
    id: string;
    name: string;
    suiteName: string | null;
    isCompleted: boolean;
    createdAt: string;
    counts: Record<ResultStatus, number>;
    total: number;
  }[];
}

export function getDashboard(projectId: string) {
  return apiFetch<DashboardData>(`/projects/${projectId}/dashboard`);
}
