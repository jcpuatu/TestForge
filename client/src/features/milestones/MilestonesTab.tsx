import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import * as milestonesApi from '../../api/milestones';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Field, Input, Label } from '../../components/Input';
import { ApiError } from '../../lib/apiClient';

export function MilestonesTab() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const milestonesQuery = useQuery({
    queryKey: ['projects', projectId, 'milestones'],
    queryFn: () => milestonesApi.listMilestones(projectId!),
  });

  const createMilestone = useMutation({
    mutationFn: () =>
      milestonesApi.createMilestone(projectId!, {
        name,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      setName('');
      setDueDate('');
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
              <Label htmlFor="milestone-due">Due date</Label>
              <Input id="milestone-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
            <div>
              <h3 className={`font-medium ${m.isCompleted ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-900 dark:text-slate-100'}`}>{m.name}</h3>
              {m.dueDate && <p className="text-xs text-slate-500 dark:text-slate-400">Due {new Date(m.dueDate).toLocaleDateString()}</p>}
            </div>
            {canManage && (
              <div className="flex gap-2">
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
          </div>
        ))}
        {milestonesQuery.data?.milestones.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No milestones yet.</p>}
      </div>
    </div>
  );
}
