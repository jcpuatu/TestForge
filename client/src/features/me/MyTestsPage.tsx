import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as meApi from '../../api/me';
import { PriorityBadge, StatusBadge } from '../../components/Badge';

export function MyTestsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['me', 'tests'], queryFn: meApi.listMyTests });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">My Tests</h1>
      <p className="mb-6 text-sm text-slate-500">Tests assigned to you in active (not yet closed) test runs, across all projects.</p>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {data?.tests.map((test) => (
          <Link key={test.id} to={`/runs/${test.run.id}`} className="flex items-center justify-between p-3 hover:bg-slate-50">
            <div>
              <div className="flex items-center gap-2">
                <PriorityBadge priority={test.priority} />
                <span className="text-sm font-medium text-slate-800">{test.titleSnapshot}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {test.run.project.name} · {test.run.name}
              </p>
            </div>
            <StatusBadge status={test.status} />
          </Link>
        ))}
        {data && data.tests.length === 0 && (
          <p className="p-4 text-sm text-slate-500">Nothing assigned to you right now — nice and clear.</p>
        )}
      </div>
    </div>
  );
}
