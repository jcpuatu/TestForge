import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import * as plansApi from '../../api/plans';
import * as milestonesApi from '../../api/milestones';
import type { Project } from '../../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Field, Input, Label, Select } from '../../components/Input';
import { ApiError } from '../../lib/apiClient';

type Context = { project: Project };

export function PlansListTab() {
  const { projectId } = useParams<{ projectId: string }>();
  useOutletContext<Context>();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const plansQuery = useQuery({ queryKey: ['projects', projectId, 'plans'], queryFn: () => plansApi.listPlans(projectId!) });
  const milestonesQuery = useQuery({
    queryKey: ['projects', projectId, 'milestones'],
    queryFn: () => milestonesApi.listMilestones(projectId!),
  });

  const createPlan = useMutation({
    mutationFn: () => plansApi.createPlan(projectId!, { name, milestoneId: milestoneId || undefined }),
    onSuccess: () => {
      setName('');
      setMilestoneId('');
      setShowForm(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'plans'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create plan'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createPlan.mutate();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Test Plans</h1>
        {canManage && <Button onClick={() => setShowForm((v) => !v)}>+ New plan</Button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <Field>
            <Label htmlFor="plan-name">Plan name</Label>
            <Input id="plan-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="plan-milestone">Milestone (optional)</Label>
            <Select id="plan-milestone" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
              <option value="">(none)</option>
              {milestonesQuery.data?.milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" disabled={createPlan.isPending}>
            Create plan
          </Button>
        </form>
      )}

      <div className="space-y-2">
        {plansQuery.data?.plans.map((plan) => (
          <Link
            key={plan.id}
            to={`/plans/${plan.id}`}
            className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:shadow-sm"
          >
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-100">{plan.name}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {plan.milestone?.name ?? 'No milestone'} · {plan._count?.runs ?? 0} runs
              </p>
            </div>
          </Link>
        ))}
        {plansQuery.data?.plans.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No test plans yet.</p>}
      </div>
    </div>
  );
}
