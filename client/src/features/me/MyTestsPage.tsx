import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as meApi from '../../api/me';
import type { MyTest } from '../../api/me';
import * as usersApi from '../../api/users';
import { useAuth } from '../auth/AuthContext';
import { PriorityBadge, StatusBadge } from '../../components/Badge';
import { StackedStatusBar } from '../../components/StackedStatusBar';
import { Select } from '../../components/Input';

function effectiveStartDate(run: MyTest['run']): string | null {
  return run.startDate ?? run.plan?.startDate ?? run.milestone?.startDate ?? null;
}

function isUpcoming(run: MyTest['run']): boolean {
  const d = effectiveStartDate(run);
  return !!d && new Date(d) > new Date();
}

function groupByRun(tests: MyTest[]) {
  const groups = new Map<string, { run: MyTest['run']; tests: MyTest[] }>();
  for (const t of tests) {
    const existing = groups.get(t.run.id);
    if (existing) existing.tests.push(t);
    else groups.set(t.run.id, { run: t.run, tests: [t] });
  }
  return [...groups.values()];
}

function RunGroup({ run, tests }: { run: MyTest['run']; tests: MyTest[] }) {
  const counts = { UNTESTED: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, RETEST: 0 };
  for (const t of tests) counts[t.status] += 1;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <Link to={`/runs/${run.id}`} className="block border-b border-slate-100 dark:border-slate-700 p-3 hover:bg-slate-50 dark:hover:bg-slate-700">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{run.name}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {run.project.name} · {tests.length} test{tests.length === 1 ? '' : 's'}
          </span>
        </div>
        <StackedStatusBar counts={counts} total={tests.length} height={6} />
      </Link>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {tests.map((test) => (
          <div key={test.id} className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <PriorityBadge priority={test.priority} />
              <span className="text-sm text-slate-700 dark:text-slate-300">{test.titleSnapshot}</span>
            </div>
            <StatusBadge status={test.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MyTestsPage() {
  const { user } = useAuth();
  const canViewOthers = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const [viewUserId, setViewUserId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['me', 'tests', viewUserId],
    queryFn: () => meApi.listMyTests(viewUserId || undefined),
  });
  const directoryQuery = useQuery({ queryKey: ['users', 'directory'], queryFn: usersApi.listUserDirectory, enabled: canViewOthers });

  const { activeGroups, upcomingGroups } = useMemo(() => {
    const tests = data?.tests ?? [];
    const active = tests.filter((t) => !isUpcoming(t.run));
    const upcoming = tests.filter((t) => isUpcoming(t.run));
    return { activeGroups: groupByRun(active), upcomingGroups: groupByRun(upcoming) };
  }, [data]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">My Tests</h1>
        {canViewOthers && (
          <div className="w-56">
            <Select value={viewUserId} onChange={(e) => setViewUserId(e.target.value)} className="py-1 text-sm" aria-label="View another user's tests">
              <option value="">My tests</option>
              {directoryQuery.data?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}'s tests
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Tests assigned {viewUserId ? 'to the selected user' : 'to you'} in active (not yet closed) test runs, across all projects.
      </p>

      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}

      {!isLoading && activeGroups.length === 0 && upcomingGroups.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Nothing assigned right now — nice and clear.</p>
      )}

      {activeGroups.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Active</h2>
          <div className="space-y-3">
            {activeGroups.map((g) => (
              <RunGroup key={g.run.id} run={g.run} tests={g.tests} />
            ))}
          </div>
        </div>
      )}

      {upcomingGroups.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Upcoming (not started yet)
          </h2>
          <div className="space-y-3">
            {upcomingGroups.map((g) => (
              <RunGroup key={g.run.id} run={g.run} tests={g.tests} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
