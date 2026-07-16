import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import * as sharedStepsApi from '../../api/sharedSteps';
import type { SharedStepSet } from '../../api/types';
import { Button } from '../../components/Button';
import { Input, Textarea } from '../../components/Input';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/apiClient';
import { stepsToText, textToSteps } from './stepsText';

export function SharedStepsManager({ projectId, sharedStepSets }: { projectId: string; sharedStepSets: SharedStepSet[] }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [newName, setNewName] = useState('');
  const [newSteps, setNewSteps] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingSteps, setEditingSteps] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SharedStepSet | null>(null);

  const deleteImpact = useQuery({
    queryKey: ['shared-step-sets', deleteTarget?.id, 'delete-impact'],
    queryFn: () => sharedStepsApi.getSharedStepSetDeleteImpact(deleteTarget!.id),
    enabled: !!deleteTarget,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'shared-step-sets'] });
  }

  const createSet = useMutation({
    mutationFn: () => sharedStepsApi.createSharedStepSet(projectId, newName, textToSteps(newSteps)),
    onSuccess: () => {
      setNewName('');
      setNewSteps('');
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create shared step set'),
  });

  const updateSet = useMutation({
    mutationFn: () => sharedStepsApi.updateSharedStepSet(editingId!, { name: editingName, steps: textToSteps(editingSteps) }),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
      showToast('Shared step set updated — every case using it now shows the new steps.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to update shared step set', 'error'),
  });

  const deleteSet = useMutation({
    mutationFn: () => sharedStepsApi.deleteSharedStepSet(deleteTarget!.id),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
      showToast('Shared step set deleted.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to delete shared step set', 'error'),
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createSet.mutate();
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="mb-3 space-y-2">
        <Input placeholder="New shared step set name" value={newName} onChange={(e) => setNewName(e.target.value)} className="py-1 text-sm" />
        <Textarea
          placeholder={'Open login page | Page loads\nEnter credentials | Logged in'}
          rows={2}
          value={newSteps}
          onChange={(e) => setNewSteps(e.target.value)}
          className="text-sm"
        />
        <Button type="submit" variant="secondary" disabled={!newName || !newSteps || createSet.isPending}>
          Add set
        </Button>
      </form>
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="space-y-2">
        {sharedStepSets.map((set) =>
          editingId === set.id ? (
            <form
              key={set.id}
              onSubmit={(e) => {
                e.preventDefault();
                updateSet.mutate();
              }}
              className="space-y-1.5 rounded-md border border-slate-200 dark:border-slate-700 p-2"
            >
              <Input autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} className="py-1 text-sm" />
              <Textarea rows={2} value={editingSteps} onChange={(e) => setEditingSteps(e.target.value)} className="text-sm" />
              <div className="flex gap-2">
                <button type="submit" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  Save
                </button>
                <button type="button" className="text-xs text-slate-500 dark:text-slate-400 hover:underline" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div key={set.id} className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300">
              <span>
                {set.name} <span className="text-xs text-slate-400 dark:text-slate-500">({set.steps.length} steps, used in {set.caseCount} case{set.caseCount === 1 ? '' : 's'})</span>
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditingId(set.id);
                    setEditingName(set.name);
                    setEditingSteps(stepsToText(set.steps));
                  }}
                  aria-label={`Edit ${set.name}`}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setDeleteTarget(set)}
                  aria-label={`Delete ${set.name}`}
                  className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/50 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ),
        )}
        {sharedStepSets.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No shared step sets yet.</p>}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteSet.mutate()}
        title={`Delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete shared step set"
        confirming={deleteSet.isPending}
        message={
          deleteImpact.data
            ? `This is used in ${deleteImpact.data.caseCount} test case${deleteImpact.data.caseCount === 1 ? '' : 's'}. Deleting it removes this step block from all of them — their own steps (if any) are not affected.`
            : 'Checking usage…'
        }
      />
    </div>
  );
}
