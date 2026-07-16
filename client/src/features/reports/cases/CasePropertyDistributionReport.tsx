import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../../../api/casesReports';
import { useProjectSections } from '../useProjectSections';
import { SectionCheckboxList } from '../SectionCheckboxList';
import { ReportShell } from '../ReportShell';
import { PropertyDistributionChart } from '../../../components/PropertyDistributionChart';
import { Select } from '../../../components/Input';

const GROUP_OPTIONS: { value: 'priority' | 'type' | 'template' | 'createdBy'; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Type' },
  { value: 'template', label: 'Template' },
  { value: 'createdBy', label: 'Created By' },
];

export function CasePropertyDistributionReport({ projectId }: { projectId: string }) {
  const [groupBy, setGroupBy] = useState<'priority' | 'type' | 'template' | 'createdBy'>('priority');
  const [sectionIds, setSectionIds] = useState<string[]>([]);

  const sectionsQuery = useProjectSections(projectId);
  const reportQuery = useQuery({
    queryKey: ['reports', 'cases', 'property-distribution', projectId, groupBy, sectionIds],
    queryFn: () => reportsApi.getCasePropertyDistribution(projectId, { groupBy, sectionIds }),
  });
  const data = reportQuery.data;

  return (
    <ReportShell
      title="Property Distribution"
      description="Summarizes test cases grouped by a chosen field — how many cases fall under each category."
      filters={
        <>
          <div className="w-40 shrink-0">
            <Select aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
              {GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Group by {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Sections (none selected = all)</p>
            <SectionCheckboxList sections={sectionsQuery.data ?? []} selected={sectionIds} onChange={setSectionIds} />
          </div>
        </>
      }
    >
      {reportQuery.isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {data && (
        <div className="print-card rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{data.total} test case(s) total</p>
          <PropertyDistributionChart buckets={data.buckets} csvFilename={`case-property-distribution-${groupBy}.csv`} />
        </div>
      )}
    </ReportShell>
  );
}
