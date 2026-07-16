import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../../../api/defectsResultsReports';
import { RunCheckboxList } from '../RunCheckboxList';
import { ReportShell } from '../ReportShell';
import { PropertyDistributionChart } from '../../../components/PropertyDistributionChart';
import { Select } from '../../../components/Input';

const GROUP_OPTIONS: { value: 'status' | 'type' | 'assignedTo' | 'template'; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'type', label: 'Type' },
  { value: 'assignedTo', label: 'Assigned To' },
  { value: 'template', label: 'Template' },
];

export function ResultPropertyDistributionReport({ projectId }: { projectId: string }) {
  const [runIds, setRunIds] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'status' | 'type' | 'assignedTo' | 'template'>('status');

  const reportQuery = useQuery({
    queryKey: ['reports', 'results', 'property-distribution', projectId, runIds, groupBy],
    queryFn: () => reportsApi.getResultPropertyDistribution(projectId, { runIds, groupBy }),
  });
  const data = reportQuery.data;

  return (
    <ReportShell
      title="Property Distribution"
      description="Summarizes tests grouped by a chosen attribute across a set of test runs."
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
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Test runs (none selected = 25 most recent)</p>
            <RunCheckboxList projectId={projectId} selected={runIds} onChange={setRunIds} />
          </div>
        </>
      }
    >
      {reportQuery.isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {data && (
        <div className="print-card rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            {data.total} test(s) across {data.runs.length} run(s)
          </p>
          <PropertyDistributionChart buckets={data.buckets} csvFilename={`result-property-distribution-${groupBy}.csv`} />
        </div>
      )}
    </ReportShell>
  );
}
