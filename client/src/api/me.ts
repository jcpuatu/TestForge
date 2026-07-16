import { apiFetch } from '../lib/apiClient';
import type { RunCase } from './runs';

export interface MyTest extends RunCase {
  run: {
    id: string;
    name: string;
    projectId: string;
    project: { name: string };
    startDate: string | null;
    plan: { startDate: string | null; milestone: { startDate: string | null } | null } | null;
    milestone: { startDate: string | null } | null;
  };
}

export function listMyTests(userId?: string) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return apiFetch<{ tests: MyTest[] }>(`/me/tests${query}`);
}

export interface WorkloadEntry {
  userId: string;
  userName: string;
  count: number;
}

export function getWorkload() {
  return apiFetch<{ workload: WorkloadEntry[] }>('/me/workload');
}
