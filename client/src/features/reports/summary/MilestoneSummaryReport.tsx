import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as milestonesApi from '../../../api/milestones';
import * as reportsApi from '../../../api/summaryReports';
import type { DateRangePreset } from '../../../api/casesReports';
import { DateRangePresetPicker } from '../DateRangePresetPicker';
import { ReportShell } from '../ReportShell';
import { SummaryReportView } from './SummaryReportView';
import { Select } from '../../../components/Input';

export function MilestoneSummaryReport({ projectId }: { projectId: string }) {
  const [milestoneId, setMilestoneId] = useState('');
  const [preset, setPreset] = useState<DateRangePreset>('thisMonth');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();

  const milestonesQuery = useQuery({
    queryKey: ['projects', projectId, 'milestones'],
    queryFn: () => milestonesApi.listMilestones(projectId),
  });
  const milestones = milestonesQuery.data?.milestones ?? [];
  const activeMilestoneId = milestoneId || milestones[0]?.id || '';

  const reportQuery = useQuery({
    queryKey: ['reports', 'summary', 'milestone', activeMilestoneId, preset, from, to],
    queryFn: () => reportsApi.getMilestoneSummary(activeMilestoneId, { preset, from, to }),
    enabled: !!activeMilestoneId,
  });

  return (
    <ReportShell
      title="Milestone Summary"
      description="High-level overview of progress and testing activity for a milestone."
      filters={
        <>
          <div className="w-56 shrink-0">
            <Select aria-label="Milestone" value={activeMilestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
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
        </>
      }
    >
      {milestones.length === 0 && !milestonesQuery.isLoading && (
        <p className="text-sm text-slate-500 dark:text-slate-400">No milestones in this project yet.</p>
      )}
      {reportQuery.isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {reportQuery.data && (
        <SummaryReportView
          data={reportQuery.data}
          csvFilename={`milestone-summary-${milestones.find((m) => m.id === activeMilestoneId)?.name ?? activeMilestoneId}.csv`}
        />
      )}
    </ReportShell>
  );
}
