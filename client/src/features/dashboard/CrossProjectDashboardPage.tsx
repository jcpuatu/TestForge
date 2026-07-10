import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as dashboardApi from '../../api/dashboard';
import { StackedStatusBar, StatusLegend } from '../../components/StackedStatusBar';
import { Badge } from '../../components/Badge';

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

export function CrossProjectDashboardPage() {
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.getCrossProjectDashboard });

  if (!data) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;

  const passRateLabel = data.passRate === null ? '—' : `${Math.round(data.passRate * 100)}%`;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">Across all {data.counts.projects} project(s).</p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Projects" value={String(data.counts.projects)} />
        <StatTile label="Test suites" value={String(data.counts.suites)} />
        <StatTile label="Test cases" value={String(data.counts.cases)} />
        <StatTile label="Test runs" value={String(data.counts.runs)} />
        <StatTile label="Pass rate (active runs)" value={passRateLabel} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By project</h2>
        <StatusLegend counts={data.totals} />
      </div>

      <div className="space-y-3">
        {data.projects.map((p) => (
          <Link
            key={p.id}
            to={`/projects/${p.id}/overview`}
            className="block rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{p.name}</span>
                {p.isCompleted && <Badge className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">Completed</Badge>}
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {p.counts.suites} suite{p.counts.suites === 1 ? '' : 's'} · {p.counts.cases} case{p.counts.cases === 1 ? '' : 's'} ·{' '}
                {p.counts.runs} run{p.counts.runs === 1 ? '' : 's'}
              </span>
            </div>
            {p.total > 0 ? (
              <StackedStatusBar counts={p.statusCounts} total={p.total} />
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">No active-run test results yet.</p>
            )}
          </Link>
        ))}
        {data.projects.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No projects yet.</p>}
      </div>
    </div>
  );
}
