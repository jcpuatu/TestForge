import { useState } from 'react';
import { StackedStatusBar, STATUS_LEGEND } from '../../../components/StackedStatusBar';
import { ActivityOverTimeChart } from '../../../components/ActivityOverTimeChart';
import { StatusBadge } from '../../../components/Badge';
import { DownloadCsvButton } from '../../../components/DownloadCsvButton';
import { downloadTableAsCsv } from '../../../lib/downloadCsv';
import type { ResultStatus } from '../../../api/runs';
import type { SummaryReportData } from '../../../api/summaryReports';

// Shared body for all four Summary reports (Milestone/Plan/Project/Runs) — Status, Activity,
// Progress, Runs-in-scope, and Tests sections, driven entirely by the aggregated data the
// server already resolved for whichever scope the caller picked. Reuses STATUS_LEGEND's
// established status color mapping for the activity chart's per-status series, rather than
// inventing a new palette.
export function SummaryReportView({ data, csvFilename }: { data: SummaryReportData; csvFilename: string }) {
  const counts = data.statusCounts as Record<ResultStatus, number>;
  // Click-to-filter drilldown (Phase K) — clicking a status segment in the bar below filters
  // the Tests list to that status; clicking the same segment again clears it. Real TestRail
  // opens the filtered view in a new tab; filtering the already-visible list in place is a
  // deliberate simplification that fits better in a single-page app.
  const [statusFilter, setStatusFilter] = useState<ResultStatus | null>(null);
  const visibleTests = statusFilter ? data.tests.filter((t) => t.status === statusFilter) : data.tests;

  function handleDownload() {
    downloadTableAsCsv(
      ['Title', 'Status', 'Assigned To', 'Run'],
      visibleTests.map((t) => [t.title, t.status, t.assignedTo ?? '', data.runs.find((r) => r.id === t.runId)?.name ?? '']),
      csvFilename,
    );
  }

  return (
    <div className="space-y-4">
      <div className="print-card rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">
          {data.total} test(s) across {data.runs.length} run(s)
          {data.passRate !== null && <> · {Math.round(data.passRate * 100)}% pass rate</>}
        </p>
        <StackedStatusBar
          counts={counts}
          total={data.total}
          height={14}
          onSegmentClick={(status) => setStatusFilter((prev) => (prev === status ? null : status))}
        />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {STATUS_LEGEND.filter((s) => counts[s.status] > 0).map((s) => (
            <button
              key={s.status}
              onClick={() => setStatusFilter((prev) => (prev === s.status ? null : s.status))}
              className={`inline-flex items-center gap-1.5 rounded px-1 ${statusFilter === s.status ? 'bg-slate-100 dark:bg-slate-700 font-medium text-slate-900 dark:text-slate-100' : ''}`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
              {s.status}: {counts[s.status]}
            </button>
          ))}
        </div>
      </div>

      <div className="print-card rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 print:text-sm print:tracking-normal print:border-b print:border-black print:pb-1">
          Activity ({new Date(data.activityFrom).toLocaleDateString()} – {new Date(data.activityTo).toLocaleDateString()})
        </p>
        <ActivityOverTimeChart
          data={data.activityByDay}
          seriesKeys={STATUS_LEGEND.map((s) => ({ key: s.status, label: s.status, color: s.color }))}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="print-card rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{Math.round(data.progress.percentComplete * 100)}%</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Complete</p>
        </div>
        <div className="print-card rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.progress.remainingCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Remaining</p>
        </div>
        <div className="print-card rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {data.progress.estimatedDaysRemaining !== null ? `~${data.progress.estimatedDaysRemaining}d` : '—'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Est. at current pace</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 print:text-sm print:tracking-normal print:border-b print:border-black print:pb-1">Runs in scope</p>
        <div className="print-card divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
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
        <div className="mb-2 flex items-center justify-between print:border-b print:border-black print:pb-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 print:text-sm print:tracking-normal">
            Tests
            {statusFilter && (
              <button onClick={() => setStatusFilter(null)} className="no-print ml-2 font-normal text-blue-600 dark:text-blue-400 hover:underline">
                filtered to {statusFilter} — clear
              </button>
            )}
          </p>
          <DownloadCsvButton onClick={handleDownload} />
        </div>
        <div className="print-card divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          {visibleTests.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-2.5 text-sm">
              <span className="text-slate-700 dark:text-slate-300">{t.title}</span>
              <span className="flex items-center gap-2">
                {t.assignedTo && <span className="text-xs text-slate-400 dark:text-slate-500">{t.assignedTo}</span>}
                <StatusBadge status={t.status as ResultStatus} />
              </span>
            </div>
          ))}
          {visibleTests.length === 0 && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No tests in scope.</p>}
        </div>
      </div>
    </div>
  );
}
