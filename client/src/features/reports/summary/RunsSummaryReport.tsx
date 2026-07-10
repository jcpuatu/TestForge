import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../../../api/summaryReports';
import type { DateRangePreset } from '../../../api/casesReports';
import { DateRangePresetPicker } from '../DateRangePresetPicker';
import { RunCheckboxList } from '../RunCheckboxList';
import { ReportShell } from '../ReportShell';
import { SummaryReportView } from './SummaryReportView';

export function RunsSummaryReport({ projectId }: { projectId: string }) {
  const [runIds, setRunIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<DateRangePreset>('thisMonth');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();

  const reportQuery = useQuery({
    queryKey: ['reports', 'summary', 'runs', projectId, runIds, preset, from, to],
    queryFn: () => reportsApi.getRunsSummary(projectId, { runIds, preset, from, to }),
  });

  return (
    <ReportShell
      title="Runs Summary"
      description="Overview of progress and testing activity across a hand-picked set of test runs."
      filters={
        <>
          <DateRangePresetPicker
            preset={preset}
            from={from}
            to={to}
            onChange={(next) => {
              setPreset(next.preset);
              setFrom(next.from);
              setTo(next.to);
            }}
          />
          <div className="w-full">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Test runs (none selected = empty report)</p>
            <RunCheckboxList projectId={projectId} selected={runIds} onChange={setRunIds} />
          </div>
        </>
      }
    >
      {reportQuery.isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {reportQuery.data && <SummaryReportView data={reportQuery.data} csvFilename="runs-summary.csv" />}
    </ReportShell>
  );
}
