import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import * as milestonesApi from '../../api/milestones';
import type { Milestone } from '../../api/milestones';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Field, Input, Label, Select } from '../../components/Input';
import { ApiError } from '../../lib/apiClient';
import { PrintButton } from '../../components/PrintButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

type MilestoneStatus = 'Upcoming' | 'Open' | 'Overdue' | 'Completed';

// Derived, not stored — Completed always wins regardless of dates; a future effective startDate
// is Upcoming; a past effective dueDate that's neither Completed nor Upcoming is Overdue;
// otherwise Open. Matches real TestRail's own Upcoming/Open split, extended with Overdue (a real
// gap found during the full-application audit — a milestone whose due date had passed weeks ago
// with no completion rendered identically to a fresh, on-track one). Uses *effective* dates (see
// effectiveDates below), not just this milestone's own literal fields, so a child milestone that
// inherits its schedule from a parent gets the same lifecycle treatment as one with its own dates.
function computeStatus(m: Milestone, effective: { startDate: string | null; dueDate: string | null }): MilestoneStatus {
  if (m.isCompleted) return 'Completed';
  if (effective.startDate && new Date(effective.startDate) > new Date()) return 'Upcoming';
  if (effective.dueDate && new Date(effective.dueDate) < new Date()) return 'Overdue';
  return 'Open';
}

const STATUS_CLASSES: Record<MilestoneStatus, string> = {
  Upcoming: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
  Open: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
  Overdue: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
  // Deliberately a different shade from Upcoming in BOTH modes, not just light mode — the two
  // previously converged on the identical dark:bg-slate-700/dark:text-slate-400 pair, so
  // "hasn't started" and "done" carried zero distinguishing color in dark mode (only the label
  // text and the separate strikethrough on the milestone's name differentiated them).
  Completed: 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500',
};

// Walks up the parentId chain for whichever of startDate/dueDate this milestone doesn't have its
// own value for — same "inherit from parent when absent" convention already used for
// Plan-from-Milestone and Run-from-Plan/Milestone, extended one level further up the hierarchy
// (a real, previously-flagged gap: a child milestone with no own dates showed nothing at all,
// unlike every other level of this app's date-inheritance chain).
function effectiveDates(
  m: Milestone,
  byId: Map<string, Milestone>,
): { startDate: string | null; dueDate: string | null; startInherited: boolean; dueInherited: boolean } {
  let startDate = m.startDate;
  let dueDate = m.dueDate;
  let startInherited = false;
  let dueInherited = false;
  let parentId = m.parentId;
  while ((!startDate || !dueDate) && parentId) {
    const parent = byId.get(parentId);
    if (!parent) break;
    if (!startDate && parent.startDate) {
      startDate = parent.startDate;
      startInherited = true;
    }
    if (!dueDate && parent.dueDate) {
      dueDate = parent.dueDate;
      dueInherited = true;
    }
    parentId = parent.parentId;
  }
  return { startDate, dueDate, startInherited, dueInherited };
}

function buildTree(milestones: Milestone[]): Array<Milestone & { depth: number }> {
  const byParent = new Map<string | null, Milestone[]>();
  for (const m of milestones) {
    const key = m.parentId;
    byParent.set(key, [...(byParent.get(key) ?? []), m]);
  }
  const result: Array<Milestone & { depth: number }> = [];
  function walk(parentId: string | null, depth: number) {
    for (const m of byParent.get(parentId) ?? []) {
      result.push({ ...m, depth });
      walk(m.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

// Parent reassignment isn't exposed here, only at creation — same deliberate scope reduction as
// Section's own drag-to-reparent-only-not-via-edit-form precedent.
function MilestoneEditForm({ milestone, onDone }: { milestone: Milestone; onDone: () => void }) {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [name, setName] = useState(milestone.name);
  const [startDate, setStartDate] = useState(toDateInput(milestone.startDate));
  const [dueDate, setDueDate] = useState(toDateInput(milestone.dueDate));
  const [references, setReferences] = useState(milestone.references ?? '');
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () =>
      milestonesApi.updateMilestone(milestone.id, {
        name,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        references: references || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to update milestone'),
  });

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        update.mutate();
      }}
      className="flex-1 space-y-2"
    >
      <Input required value={name} onChange={(e) => setName(e.target.value)} className="text-sm" />
      <div className="flex gap-2">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm" aria-label="Start date" />
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-sm" aria-label="Due date" />
      </div>
      <Input placeholder="References (e.g. JIRA-1, JIRA-2)" value={references} onChange={(e) => setReferences(e.target.value)} className="text-sm" />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={update.isPending} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
          Save
        </button>
        <button type="button" onClick={onDone} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function MilestonesTab() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [references, setReferences] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null);

  const milestonesQuery = useQuery({
    queryKey: ['projects', projectId, 'milestones'],
    queryFn: () => milestonesApi.listMilestones(projectId!),
  });
  const milestones = milestonesQuery.data?.milestones ?? [];

  const deleteImpactQuery = useQuery({
    queryKey: ['milestones', deleteTarget?.id, 'delete-impact'],
    queryFn: () => milestonesApi.getMilestoneDeleteImpact(deleteTarget!.id),
    enabled: !!deleteTarget,
  });

  const createMilestone = useMutation({
    mutationFn: () =>
      milestonesApi.createMilestone(projectId!, {
        name,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        references: references || undefined,
        parentId: parentId || undefined,
      }),
    onSuccess: () => {
      setName('');
      setStartDate('');
      setDueDate('');
      setReferences('');
      setParentId('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create milestone'),
  });

  const toggleComplete = useMutation({
    mutationFn: ({ id, isCompleted }: { id: string; isCompleted: boolean }) => milestonesApi.updateMilestone(id, { isCompleted }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] }),
  });

  const startMilestone = useMutation({
    mutationFn: (id: string) => milestonesApi.updateMilestone(id, { startDate: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] }),
  });

  const deleteMilestone = useMutation({
    mutationFn: (id: string) => milestonesApi.deleteMilestone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] });
      setDeleteTarget(null);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createMilestone.mutate();
  }

  const tree = buildTree(milestones);
  const byId = new Map(milestones.map((m) => [m.id, m]));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Milestones</h1>
        <PrintButton />
      </div>
      {canManage && (
        <form onSubmit={handleSubmit} className="no-print mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="flex-1">
            <Field>
              <Label htmlFor="milestone-name">Name</Label>
              <Input id="milestone-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field>
              <Label htmlFor="milestone-parent">Parent (optional)</Label>
              <Select id="milestone-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">(none — top level)</option>
                {tree.map((m) => (
                  <option key={m.id} value={m.id}>
                    {'—'.repeat(m.depth)} {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div>
            <Field>
              <Label htmlFor="milestone-start">Start date</Label>
              <Input id="milestone-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field>
              <Label htmlFor="milestone-due">Due date</Label>
              <Input id="milestone-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field>
              <Label htmlFor="milestone-references">References</Label>
              <Input id="milestone-references" placeholder="JIRA-1, JIRA-2" value={references} onChange={(e) => setReferences(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" disabled={createMilestone.isPending} className="mb-3">
            Add milestone
          </Button>
        </form>
      )}
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="space-y-2">
        {tree.map((m) => {
          const effective = effectiveDates(m, byId);
          const status = computeStatus(m, effective);
          return (
            <div
              key={m.id}
              style={{ marginLeft: m.depth * 24 }}
              className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
            >
              {editingId === m.id ? (
                <MilestoneEditForm milestone={m} onDone={() => setEditingId(null)} />
              ) : (
                <>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className={`font-medium ${m.isCompleted ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-900 dark:text-slate-100'}`}>{m.name}</h3>
                      <Badge className={STATUS_CLASSES[status]}>{status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {effective.startDate && (
                        <>
                          Starts {new Date(effective.startDate).toLocaleDateString()}
                          {effective.startInherited && ' (inherited)'}{' '}
                        </>
                      )}
                      {effective.dueDate && (
                        <>
                          · Due {new Date(effective.dueDate).toLocaleDateString()}
                          {effective.dueInherited && ' (inherited)'}
                        </>
                      )}
                      {!effective.startDate && !effective.dueDate && 'No dates set'}
                    </p>
                    {m.references && <p className="print-detail-only text-xs text-slate-400 dark:text-slate-500">Refs: {m.references}</p>}
                  </div>
                  {canManage && (
                    <div className="no-print flex gap-2">
                      {status === 'Upcoming' && (
                        <button
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={() => startMilestone.mutate(m.id)}
                          disabled={startMilestone.isPending}
                        >
                          Start milestone
                        </button>
                      )}
                      <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setEditingId(m.id)}>
                        Edit
                      </button>
                      <button
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        onClick={() => toggleComplete.mutate({ id: m.id, isCompleted: !m.isCompleted })}
                      >
                        {m.isCompleted ? 'Reopen' : 'Mark complete'}
                      </button>
                      <button className="text-xs text-red-600 dark:text-red-400 hover:underline" onClick={() => setDeleteTarget(m)}>
                        Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {milestones.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No milestones yet.</p>}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMilestone.mutate(deleteTarget!.id)}
        title={`Delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete milestone"
        confirming={deleteMilestone.isPending}
        message={
          deleteImpactQuery.data ? (
            <>
              {deleteImpactQuery.data.planCount === 0 && deleteImpactQuery.data.runCount === 0 && deleteImpactQuery.data.childMilestoneCount === 0 ? (
                'Nothing else references this milestone.'
              ) : (
                <>
                  {deleteImpactQuery.data.planCount > 0 && (
                    <>
                      <strong>{deleteImpactQuery.data.planCount}</strong> plan(s){' '}
                    </>
                  )}
                  {deleteImpactQuery.data.runCount > 0 && (
                    <>
                      and <strong>{deleteImpactQuery.data.runCount}</strong> run(s){' '}
                    </>
                  )}
                  {(deleteImpactQuery.data.planCount > 0 || deleteImpactQuery.data.runCount > 0) && 'will be unlinked from this milestone (their inherited dates will no longer apply). '}
                  {deleteImpactQuery.data.childMilestoneCount > 0 && (
                    <>
                      <strong>{deleteImpactQuery.data.childMilestoneCount}</strong> child milestone(s) will move up to this milestone's own parent.{' '}
                    </>
                  )}
                </>
              )}
              This cannot be undone.
            </>
          ) : (
            'Loading impact…'
          )
        }
      />
    </div>
  );
}
