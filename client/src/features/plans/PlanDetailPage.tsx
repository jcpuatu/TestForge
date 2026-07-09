import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import * as plansApi from '../../api/plans';
import * as suitesApi from '../../api/suites';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Field, Input, Label, Select } from '../../components/Input';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/apiClient';

export function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManage = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [suiteId, setSuiteId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingDates, setEditingDates] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [referenceId, setReferenceId] = useState('');

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

  const updatePlan = useMutation({
    mutationFn: (newName: string) => plansApi.updatePlan(planId!, { name: newName }),
    onSuccess: () => {
      setEditingName(null);
      queryClient.invalidateQueries({ queryKey: ['plans', planId] });
      showToast('Plan renamed.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to rename plan', 'error'),
  });

  const updateDates = useMutation({
    mutationFn: () =>
      plansApi.updatePlan(planId!, {
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        referenceId: referenceId || undefined,
      }),
    onSuccess: () => {
      setEditingDates(false);
      queryClient.invalidateQueries({ queryKey: ['plans', planId] });
      showToast('Plan dates updated.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to update dates', 'error'),
  });

  const deletePlan = useMutation({
    mutationFn: () => plansApi.deletePlan(planId!),
    onSuccess: () => {
      showToast('Plan deleted.');
      navigate(`/projects/${planQuery.data!.plan.projectId}/plans`);
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to delete plan', 'error'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    addRun.mutate();
  }

  if (!planQuery.data) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
  const plan = planQuery.data.plan;

  return (
    <div>
      <Link to={`/projects/${plan.projectId}/plans`} className="mb-4 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Back to plans
      </Link>
      {editingName !== null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updatePlan.mutate(editingName);
          }}
          className="mb-1 flex items-center gap-2"
        >
          <Input
            autoFocus
            aria-label="Plan name"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            className="text-2xl font-semibold"
          />
          <Button type="submit" disabled={updatePlan.isPending}>
            Save
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditingName(null)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="group mb-1 flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{plan.name}</h1>
          {canManage && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button
                onClick={() => setEditingName(plan.name)}
                aria-label="Rename plan"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete plan"
                className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/50 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
      {plan.milestone && <p className="text-sm text-slate-500 dark:text-slate-400">Milestone: {plan.milestone.name}</p>}

      <div className="mb-6 mt-1">
        {editingDates ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateDates.mutate();
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <Field>
              <Label htmlFor="plan-start">Start date</Label>
              <Input id="plan-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field>
              <Label htmlFor="plan-end">End date</Label>
              <Input id="plan-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            <Field>
              <Label htmlFor="plan-reference">Reference</Label>
              <Input id="plan-reference" placeholder="PROJ-42" value={referenceId} onChange={(e) => setReferenceId(e.target.value)} />
            </Field>
            <Button type="submit" disabled={updateDates.isPending} className="mb-3">
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditingDates(false)} className="mb-3">
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>
              {plan.startDate || plan.endDate ? (
                <>
                  {plan.startDate && `Starts ${new Date(plan.startDate).toLocaleDateString()}`}
                  {plan.startDate && plan.endDate && ' · '}
                  {plan.endDate && `Ends ${new Date(plan.endDate).toLocaleDateString()}`}
                </>
              ) : plan.milestone?.dueDate ? (
                <>Inherits milestone due date: {new Date(plan.milestone.dueDate).toLocaleDateString()}</>
              ) : (
                'No dates set'
              )}
              {plan.referenceId && ` · Ref: ${plan.referenceId}`}
            </span>
            {canManage && !plan.isCompleted && (
              <button
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                onClick={() => {
                  setStartDate(plan.startDate ? plan.startDate.slice(0, 10) : '');
                  setEndDate(plan.endDate ? plan.endDate.slice(0, 10) : '');
                  setReferenceId(plan.referenceId ?? '');
                  setEditingDates(true);
                }}
              >
                Edit dates
              </button>
            )}
          </div>
        )}
        {plan.endDate && plan.milestone?.dueDate && new Date(plan.endDate) > new Date(plan.milestone.dueDate) && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            This plan's end date is after its milestone's due date ({new Date(plan.milestone.dueDate).toLocaleDateString()}).
          </p>
        )}
      </div>

      {canManage && (
        <div className="mb-4">
          <Button onClick={() => setShowForm((v) => !v)}>+ Add run to plan</Button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
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
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
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
            className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:shadow-sm"
          >
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-100">{run.name}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{run.suite?.name}</p>
            </div>
            <Badge className={run.isCompleted ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400' : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'}>
              {run.isCompleted ? 'Closed' : 'Active'}
            </Badge>
          </Link>
        ))}
        {plan.runs.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No runs in this plan yet.</p>}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deletePlan.mutate()}
        title={`Delete "${plan.name}"?`}
        confirmLabel="Delete plan"
        confirming={deletePlan.isPending}
        message={
          <>
            This deletes the plan. Its <strong>{plan.runs.length}</strong> run(s) will remain but will no longer be grouped
            under this plan.
          </>
        }
      />
    </div>
  );
}
