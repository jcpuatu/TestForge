import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../../../api/summaryReports';
import type { DateRangePreset } from '../../../api/casesReports';
import { DateRangePresetPicker } from '../DateRangePresetPicker';
import { ReportShell } from '../ReportShell';
import { SummaryReportView } from './SummaryReportView';

export function ProjectSummaryReport({ projectId }: { projectId: string }) {
  const [preset, setPreset] = useState<DateRangePreset>('thisMonth');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();

  const reportQuery = useQuery({
    queryKey: ['reports', 'summary', 'project', projectId, preset, from, to],
    queryFn: () => reportsApi.getProjectSummary(projectId, { preset, from, to }),
  });

  return (
    <ReportShell
      title="Project Summary"
      description="Overview of progress and testing activity across every test run in this project."
      filters={
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
      }
    >
      {reportQuery.isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {reportQuery.data && <SummaryReportView data={reportQuery.data} csvFilename="project-summary.csv" />}
    </ReportShell>
  );
}
