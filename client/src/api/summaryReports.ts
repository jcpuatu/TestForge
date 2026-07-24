import { apiFetch } from '../lib/apiClient';
import type { DateRangePreset } from './casesReports';

export interface SummaryReportRun {
  id: string;
  name: string;
  isCompleted: boolean;
}

export interface SummaryActivityDay {
  period: string;
  PASSED: number;
  FAILED: number;
  BLOCKED: number;
  RETEST: number;
  UNTESTED: number;
  // Index signature so this is structurally assignable to ActivityOverTimeChart's generic
  // `Array<Record<string, number | string>>` prop type — a named/closed interface (even one
  // whose fields are all string|number) isn't automatically compatible with a Record<string, X>
  // parameter without one, since TS can't otherwise rule out the interface being narrower than
  // the index signature promises.
  [key: string]: string | number;
}

export interface SummaryReportData {
  runs: SummaryReportRun[];
  statusCounts: Record<string, number>;
  total: number;
  passRate: number | null;
  activityFrom: string;
  activityTo: string;
  activityByDay: SummaryActivityDay[];
  progress: {
    completedCount: number;
    remainingCount: number;
    percentComplete: number;
    estimatedDaysRemaining: number | null;
  };
  tests: { id: string; title: string; status: string; runId: string; assignedTo: string | null }[];
}

export interface SummaryReportFilter {
  preset?: DateRangePreset;
  from?: string;
  to?: string;
}

function buildQuery(params: Record<string, string | string[] | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) usp.set(key, value.join(','));
    } else {
      usp.set(key, value);
    }
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function getMilestoneSummary(milestoneId: string, filter: SummaryReportFilter) {
  const qs = buildQuery({ preset: filter.preset, from: filter.from, to: filter.to });
  return apiFetch<SummaryReportData>(`/milestones/${milestoneId}/reports/summary${qs}`);
}

export function getPlanSummary(planId: string, filter: SummaryReportFilter) {
  const qs = buildQuery({ preset: filter.preset, from: filter.from, to: filter.to });
  return apiFetch<SummaryReportData>(`/plans/${planId}/reports/summary${qs}`);
}

export function getProjectSummary(projectId: string, filter: SummaryReportFilter) {
  const qs = buildQuery({ preset: filter.preset, from: filter.from, to: filter.to });
  return apiFetch<SummaryReportData>(`/projects/${projectId}/reports/summary${qs}`);
}

export function getRunsSummary(projectId: string, filter: SummaryReportFilter & { runIds?: string[] }) {
  const qs = buildQuery({ preset: filter.preset, from: filter.from, to: filter.to, runIds: filter.runIds });
  return apiFetch<SummaryReportData>(`/projects/${projectId}/reports/runs-summary${qs}`);
}
