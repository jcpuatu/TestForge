import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import * as plansApi from '../../api/plans';
import * as suitesApi from '../../api/suites';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Field, Input, Label, Select } from '../../components/Input';
import { ApiError } from '../../lib/apiClient';

export function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [suiteId, setSuiteId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const planQuery = useQuery({ queryKey: ['plans', planId], queryFn: () => plansApi.getPlan(planId!), enabled: !!planId });
  const suitesQuery = useQuery({
    queryKey: ['projects', planQuery.data?.plan.projectId, 'suites'],
    queryFn: () => suitesApi.listSuites(planQuery.data!.plan.projectId),
    enabled: !!planQuery.data,
  });

  const addRun = useMutation({
    mutationFn: () => plansApi.createPlanRun(planId!, { name, suiteId }),
    onSuccess: () => {
      setName('');
      setSuiteId('');
      setShowForm(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['plans', planId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to add run'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    addRun.mutate();
  }

  if (!planQuery.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const plan = planQuery.data.plan;

  return (
    <div>
      <Link to={`/projects/${plan.projectId}/plans`} className="mb-4 inline-block text-sm text-blue-600 hover:underline">
        ← Back to plans
      </Link>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">{plan.name}</h1>
      {plan.milestone && <p className="mb-6 text-sm text-slate-500">Milestone: {plan.milestone.name}</p>}

      {canManage && (
        <div className="mb-4">
          <Button onClick={() => setShowForm((v) => !v)}>+ Add run to plan</Button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <Field>
            <Label htmlFor="plan-run-name">Run name</Label>
            <Input id="plan-run-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="plan-run-suite">Suite</Label>
            <Select id="plan-run-suite" required value={suiteId} onChange={(e) => setSuiteId(e.target.value)}>
              <option value="" disabled>
                Select a suite…
              </option>
              {suitesQuery.data?.suites.map((suite) => (
                <option key={suite.id} value={suite.id}>
                  {suite.name}
                </option>
              ))}
            </Select>
          </Field>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={addRun.isPending}>
            {addRun.isPending ? 'Creating…' : 'Create run'}
          </Button>
        </form>
      )}

      <div className="space-y-2">
        {plan.runs.map((run) => (
          <Link
            key={run.id}
            to={`/runs/${run.id}`}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 hover:shadow-sm"
          >
            <div>
              <h3 className="font-medium text-slate-900">{run.name}</h3>
              <p className="mt-1 text-xs text-slate-500">{run.suite?.name}</p>
            </div>
            <Badge className={run.isCompleted ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'}>
              {run.isCompleted ? 'Closed' : 'Active'}
            </Badge>
          </Link>
        ))}
        {plan.runs.length === 0 && <p className="text-sm text-slate-500">No runs in this plan yet.</p>}
      </div>
    </div>
  );
}
