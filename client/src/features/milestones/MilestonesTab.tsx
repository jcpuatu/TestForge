import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import * as milestonesApi from '../../api/milestones';
import type { Milestone } from '../../api/milestones';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Field, Input, Label } from '../../components/Input';
import { ApiError } from '../../lib/apiClient';

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

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
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const milestonesQuery = useQuery({
    queryKey: ['projects', projectId, 'milestones'],
    queryFn: () => milestonesApi.listMilestones(projectId!),
  });

  const createMilestone = useMutation({
    mutationFn: () =>
      milestonesApi.createMilestone(projectId!, {
        name,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        references: references || undefined,
      }),
    onSuccess: () => {
      setName('');
      setStartDate('');
      setDueDate('');
      setReferences('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create milestone'),
  });

  const toggleComplete = useMutation({
    mutationFn: ({ id, isCompleted }: { id: string; isCompleted: boolean }) => milestonesApi.updateMilestone(id, { isCompleted }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] }),
  });

  const deleteMilestone = useMutation({
    mutationFn: (id: string) => milestonesApi.deleteMilestone(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createMilestone.mutate();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Milestones</h1>
      {canManage && (
        <form onSubmit={handleSubmit} className="mb-6 flex items-end gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="flex-1">
            <Field>
              <Label htmlFor="milestone-name">Name</Label>
              <Input id="milestone-name" required value={name} onChange={(e) => setName(e.target.value)} />
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
        {milestonesQuery.data?.milestones.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            {editingId === m.id ? (
              <MilestoneEditForm milestone={m} onDone={() => setEditingId(null)} />
            ) : (
              <>
                <div>
                  <h3 className={`font-medium ${m.isCompleted ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-900 dark:text-slate-100'}`}>{m.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {m.startDate && <>Starts {new Date(m.startDate).toLocaleDateString()} </>}
                    {m.dueDate && <>· Due {new Date(m.dueDate).toLocaleDateString()}</>}
                  </p>
                  {m.references && <p className="text-xs text-slate-400 dark:text-slate-500">Refs: {m.references}</p>}
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setEditingId(m.id)}>
                      Edit
                    </button>
                    <button
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      onClick={() => toggleComplete.mutate({ id: m.id, isCompleted: !m.isCompleted })}
                    >
                      {m.isCompleted ? 'Reopen' : 'Mark complete'}
                    </button>
                    <button className="text-xs text-red-600 dark:text-red-400 hover:underline" onClick={() => deleteMilestone.mutate(m.id)}>
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {milestonesQuery.data?.milestones.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No milestones yet.</p>}
      </div>
    </div>
  );
}
