import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import * as runsApi from '../../api/runs';
import * as usersApi from '../../api/users';
import type { Project, Suite } from '../../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { StackedStatusBar } from '../../components/StackedStatusBar';
import { Field, Input, Label, Select } from '../../components/Input';
import { ApiError } from '../../lib/apiClient';

type Context = { project: Project & { suites: Suite[] } };

export function RunsListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useOutletContext<Context>();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [suiteId, setSuiteId] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const runsQuery = useQuery({ queryKey: ['projects', projectId, 'runs'], queryFn: () => runsApi.listRuns(projectId!) });
  const directoryQuery = useQuery({ queryKey: ['users', 'directory'], queryFn: usersApi.listUserDirectory });

  const createRun = useMutation({
    mutationFn: () => runsApi.createRun(projectId!, { name, suiteId, assignedToId: assignedToId || undefined }),
    onSuccess: () => {
      setName('');
      setSuiteId('');
      setAssignedToId('');
      setShowForm(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'runs'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create run'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createRun.mutate();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Test Runs &amp; Results</h1>
        {canManage && <Button onClick={() => setShowForm((v) => !v)}>+ New run</Button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <Field>
            <Label htmlFor="run-name">Run name</Label>
            <Input id="run-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="run-suite">Suite (all its test cases will be included)</Label>
            <Select id="run-suite" required value={suiteId} onChange={(e) => setSuiteId(e.target.value)}>
              <option value="" disabled>
                Select a suite…
              </option>
              {project.suites.map((suite: Suite) => (
                <option key={suite.id} value={suite.id}>
                  {suite.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="run-assignee">Assign all tests to (optional)</Label>
            <Select id="run-assignee" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
              <option value="">Unassigned</option>
              {directoryQuery.data?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" disabled={createRun.isPending}>
            {createRun.isPending ? 'Creating…' : 'Create run'}
          </Button>
        </form>
      )}

      <div className="space-y-2">
        {runsQuery.data?.runs.map((run) => {
          const total = run.total ?? 0;
          const passRate = total > 0 && run.counts ? Math.round((run.counts.PASSED / total) * 100) : null;
          return (
            <Link
              key={run.id}
              to={`/runs/${run.id}`}
              className="block rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-slate-900 dark:text-slate-100">{run.name}</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {run.suite?.name} · {run._count?.runCases ?? 0} tests
                    {passRate !== null && <> · {passRate}% passed</>}
                  </p>
                </div>
                <Badge className={run.isCompleted ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400' : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'}>
                  {run.isCompleted ? 'Closed' : 'Active'}
                </Badge>
              </div>
              {run.counts && <StackedStatusBar counts={run.counts} total={total} height={6} />}
            </Link>
          );
        })}
        {runsQuery.data?.runs.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No test runs yet.</p>}
      </div>
    </div>
  );
}
