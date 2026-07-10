import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as plansApi from '../../../api/plans';
import * as reportsApi from '../../../api/summaryReports';
import type { DateRangePreset } from '../../../api/casesReports';
import { DateRangePresetPicker } from '../DateRangePresetPicker';
import { ReportShell } from '../ReportShell';
import { SummaryReportView } from './SummaryReportView';
import { Select } from '../../../components/Input';

export function PlanSummaryReport({ projectId }: { projectId: string }) {
  const [planId, setPlanId] = useState('');
  const [preset, setPreset] = useState<DateRangePreset>('thisMonth');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();

  const plansQuery = useQuery({ queryKey: ['projects', projectId, 'plans'], queryFn: () => plansApi.listPlans(projectId) });
  const plans = plansQuery.data?.plans ?? [];
  const activePlanId = planId || plans[0]?.id || '';

  const reportQuery = useQuery({
    queryKey: ['reports', 'summary', 'plan', activePlanId, preset, from, to],
    queryFn: () => reportsApi.getPlanSummary(activePlanId, { preset, from, to }),
    enabled: !!activePlanId,
  });

  return (
    <ReportShell
      title="Plan Summary"
      description="High-level overview of progress and testing activity for a test plan."
      filters={
        <>
          <div className="w-56 shrink-0">
            <Select aria-label="Test plan" value={activePlanId} onChange={(e) => setPlanId(e.target.value)}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
      {plans.length === 0 && !plansQuery.isLoading && (
        <p className="text-sm text-slate-500 dark:text-slate-400">No test plans in this project yet.</p>
      )}
      {reportQuery.isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {reportQuery.data && (
        <SummaryReportView data={reportQuery.data} csvFilename={`plan-summary-${plans.find((p) => p.id === activePlanId)?.name ?? activePlanId}.csv`} />
      )}
    </ReportShell>
  );
}
