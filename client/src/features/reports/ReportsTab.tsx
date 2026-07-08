import { useQuery } from '@tanstack/react-query';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import * as reportsApi from '../../api/reports';
import type { Project } from '../../api/types';
import { StackedStatusBar, StatusLegend } from '../../components/StackedStatusBar';

type Context = { project: Project };

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function ReportsTab() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useOutletContext<Context>();
  const { data } = useQuery({
    queryKey: ['projects', projectId, 'dashboard'],
    queryFn: () => reportsApi.getDashboard(projectId!),
    enabled: !!projectId,
  });

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const passRateLabel = data.passRate === null ? '—' : `${Math.round(data.passRate * 100)}%`;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">{project.name}</h1>
      {project.description && <p className="mb-5 text-sm text-slate-500">{project.description}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Test suites" value={String(data.counts.suites)} />
        <StatTile label="Test cases" value={String(data.counts.cases)} />
        <StatTile label="Test runs" value={String(data.counts.runs)} />
        <StatTile label="Milestones" value={String(data.counts.milestones)} />
        <StatTile label="Pass rate (recent)" value={passRateLabel} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Recent test runs</h2>
        <StatusLegend counts={data.totals} />
      </div>

      <div className="space-y-3">
        {data.recentRuns.map((run) => (
          <Link
            key={run.id}
            to={`/runs/${run.id}`}
            className="block rounded-lg border border-slate-200 bg-white p-4 hover:shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800">{run.name}</span>
              <span className="text-xs text-slate-400">{run.suiteName}</span>
            </div>
            <StackedStatusBar counts={run.counts} total={run.total} />
          </Link>
        ))}
        {data.recentRuns.length === 0 && <p className="text-sm text-slate-500">No test runs yet.</p>}
      </div>
    </div>
  );
}
