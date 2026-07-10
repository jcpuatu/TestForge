import { StackedStatusBar, STATUS_LEGEND } from '../../../components/StackedStatusBar';
import { ActivityOverTimeChart } from '../../../components/ActivityOverTimeChart';
import { StatusBadge } from '../../../components/Badge';
import type { ResultStatus } from '../../../api/runs';
import type { SummaryReportData } from '../../../api/summaryReports';

// Shared body for all four Summary reports (Milestone/Plan/Project/Runs) — Status, Activity,
// Progress, Runs-in-scope, and Tests sections, driven entirely by the aggregated data the
// server already resolved for whichever scope the caller picked. Reuses STATUS_LEGEND's
// established status color mapping for the activity chart's per-status series, rather than
// inventing a new palette.
export function SummaryReportView({ data }: { data: SummaryReportData }) {
  const counts = data.statusCounts as Record<ResultStatus, number>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">
          {data.total} test(s) across {data.runs.length} run(s)
          {data.passRate !== null && <> · {Math.round(data.passRate * 100)}% pass rate</>}
        </p>
        <StackedStatusBar counts={counts} total={data.total} height={14} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {STATUS_LEGEND.filter((s) => counts[s.status] > 0).map((s) => (
            <span key={s.status} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
              {s.status}: {counts[s.status]}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Activity ({new Date(data.activityFrom).toLocaleDateString()} – {new Date(data.activityTo).toLocaleDateString()})
        </p>
        <ActivityOverTimeChart
          data={data.activityByDay}
          seriesKeys={STATUS_LEGEND.map((s) => ({ key: s.status, label: s.status, color: s.color }))}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{Math.round(data.progress.percentComplete * 100)}%</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Complete</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.progress.remainingCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Remaining</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {data.progress.estimatedDaysRemaining !== null ? `~${data.progress.estimatedDaysRemaining}d` : '—'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Est. at current pace</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Runs in scope</p>
        <div className="divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          {data.runs.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-2.5 text-sm">
              <span className="text-slate-700 dark:text-slate-300">{r.name}</span>
              {r.isCompleted && <span className="text-xs text-slate-400 dark:text-slate-500">Closed</span>}
            </div>
          ))}
          {data.runs.length === 0 && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No test runs in scope.</p>}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tests</p>
        <div className="divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          {data.tests.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-2.5 text-sm">
              <span className="text-slate-700 dark:text-slate-300">{t.title}</span>
              <span className="flex items-center gap-2">
                {t.assignedTo && <span className="text-xs text-slate-400 dark:text-slate-500">{t.assignedTo}</span>}
                <StatusBadge status={t.status as ResultStatus} />
              </span>
            </div>
          ))}
          {data.tests.length === 0 && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No tests in scope.</p>}
        </div>
      </div>
    </div>
  );
}
