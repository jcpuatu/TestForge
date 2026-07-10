import { apiFetch } from '../lib/apiClient';

export type DateRangePreset = 'today' | 'yesterday' | 'lastWeek' | 'thisWeek' | 'lastMonth' | 'thisMonth' | 'custom';

export interface DistributionBucket {
  value: string;
  count: number;
  percent: number;
}

export interface ActivitySummaryFilter {
  preset?: DateRangePreset;
  from?: string;
  to?: string;
  groupBy?: 'day' | 'month' | 'section';
  includeNew?: boolean;
  includeUpdated?: boolean;
  sectionIds?: string[];
}

export interface ActivitySummaryChangeRow {
  id: string;
  title: string;
  sectionId: string | null;
  sectionName: string | null;
  changeType: 'created' | 'updated';
  at: string;
}

export interface ActivitySummaryData {
  from: string;
  to: string;
  groupBy: 'day' | 'month' | 'section';
  newCount: number;
  updatedCount: number;
  series?: { period: string; created: number; updated: number }[];
  groups?: { sectionId: string | null; sectionName: string; created: number; updated: number }[];
  cases: ActivitySummaryChangeRow[];
}

function buildQuery(params: Record<string, string | string[] | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) usp.set(key, value.join(','));
    } else {
      usp.set(key, String(value));
    }
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function getActivitySummary(projectId: string, filter: ActivitySummaryFilter) {
  const qs = buildQuery({
    preset: filter.preset,
    from: filter.from,
    to: filter.to,
    groupBy: filter.groupBy,
    includeNew: filter.includeNew,
    includeUpdated: filter.includeUpdated,
    sectionIds: filter.sectionIds,
  });
  return apiFetch<ActivitySummaryData>(`/projects/${projectId}/reports/cases/activity-summary${qs}`);
}

export interface CoverageForReferencesFilter {
  sectionIds?: string[];
  referenceIds?: string[];
  includeWithRefs?: boolean;
  includeWithoutRefs?: boolean;
}

export interface CoverageForReferencesData {
  total: number;
  coveredCount: number;
  uncoveredCount: number;
  coveragePercent: number;
  references: { reference: string; cases: { id: string; title: string; priority: string }[] }[];
  casesWithReferences: { id: string; title: string; referenceLink: string | null }[];
  casesWithoutReferences: { id: string; title: string }[];
}

export function getCoverageForReferences(projectId: string, filter: CoverageForReferencesFilter) {
  const qs = buildQuery({
    sectionIds: filter.sectionIds,
    referenceIds: filter.referenceIds,
    includeWithRefs: filter.includeWithRefs,
    includeWithoutRefs: filter.includeWithoutRefs,
  });
  return apiFetch<CoverageForReferencesData>(`/projects/${projectId}/reports/cases/coverage-for-references${qs}`);
}

export interface CasePropertyDistributionFilter {
  groupBy?: 'priority' | 'type' | 'template' | 'createdBy';
  sectionIds?: string[];
}

export interface CasePropertyDistributionData {
  groupBy: string;
  total: number;
  buckets: DistributionBucket[];
}

export function getCasePropertyDistribution(projectId: string, filter: CasePropertyDistributionFilter) {
  const qs = buildQuery({ groupBy: filter.groupBy, sectionIds: filter.sectionIds });
  return apiFetch<CasePropertyDistributionData>(`/projects/${projectId}/reports/cases/property-distribution${qs}`);
}

export interface StatusTopsFilter {
  runIds?: string[];
  sectionIds?: string[];
  latestOnly?: boolean;
  statuses?: string[];
}

export interface StatusTopsData {
  runs: { id: string; name: string; isCompleted: boolean }[];
  latestOnly: boolean;
  total: number;
  buckets: DistributionBucket[];
  cases: { caseId: string | null; title: string; priority: string; status: string; runId: string }[];
}

export function getStatusTops(projectId: string, filter: StatusTopsFilter) {
  const qs = buildQuery({
    runIds: filter.runIds,
    sectionIds: filter.sectionIds,
    latestOnly: filter.latestOnly,
    statuses: filter.statuses,
  });
  return apiFetch<StatusTopsData>(`/projects/${projectId}/reports/cases/status-tops${qs}`);
}
