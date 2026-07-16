import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../../../api/casesReports';
import { useProjectSections } from '../useProjectSections';
import { SectionCheckboxList } from '../SectionCheckboxList';
import { RunCheckboxList } from '../RunCheckboxList';
import { ReportShell } from '../ReportShell';
import { PropertyDistributionChart } from '../../../components/PropertyDistributionChart';
import { StatusBadge } from '../../../components/Badge';
import { DownloadCsvButton } from '../../../components/DownloadCsvButton';
import { downloadTableAsCsv } from '../../../lib/downloadCsv';
import type { ResultStatus } from '../../../api/runs';

export function StatusTopsReport({ projectId }: { projectId: string }) {
  const [runIds, setRunIds] = useState<string[]>([]);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [latestOnly, setLatestOnly] = useState(true);

  const sectionsQuery = useProjectSections(projectId);
  const reportQuery = useQuery({
    queryKey: ['reports', 'cases', 'status-tops', projectId, runIds, sectionIds, latestOnly],
    queryFn: () => reportsApi.getStatusTops(projectId, { runIds, sectionIds, latestOnly }),
  });
  const data = reportQuery.data;

  return (
    <ReportShell
      title="Status Tops"
      description="Cases grouped by their latest — or every — result status across a set of test runs."
      filters={
        <>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} />
            Latest test result per test only
          </label>
          <div className="w-full">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Test runs (none selected = 25 most recent)</p>
            <RunCheckboxList projectId={projectId} selected={runIds} onChange={setRunIds} />
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
        <>
          <div className="print-card mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              {data.total} test(s) across {data.runs.length} run(s)
            </p>
            <PropertyDistributionChart buckets={data.buckets} csvFilename="status-tops-buckets.csv" />
          </div>

          <div className="mb-2 flex justify-end">
            <DownloadCsvButton
              onClick={() =>
                downloadTableAsCsv(
                  ['Title', 'Priority', 'Status', 'Run'],
                  data.cases.map((c) => [c.title, c.priority, c.status, data.runs.find((r) => r.id === c.runId)?.name ?? '']),
                  'status-tops.csv',
                )
              }
            />
          </div>
          <div className="print-card divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            {data.cases.slice(0, 200).map((c, i) => (
              <div key={`${c.caseId}-${c.runId}-${i}`} className="flex items-center justify-between p-2.5 text-sm">
                <span className="text-slate-700 dark:text-slate-300">{c.title}</span>
                <StatusBadge status={c.status as ResultStatus} />
              </div>
            ))}
            {data.cases.length === 0 && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No test cases found with this status.</p>}
          </div>
        </>
      )}
    </ReportShell>
  );
}
