import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import * as labelsApi from '../../api/labels';
import type { Label } from '../../api/types';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/apiClient';

export function LabelManager({ projectId, labels }: { projectId: string; labels: Label[] }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Label | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'labels'] });
  }

  const createLabel = useMutation({
    mutationFn: () => labelsApi.createLabel(projectId, newName),
    onSuccess: () => {
      setNewName('');
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create label'),
  });

  const renameLabel = useMutation({
    mutationFn: () => labelsApi.updateLabel(editingId!, editingName),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
      showToast('Label renamed — updated everywhere it was used.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to rename label', 'error'),
  });

  const deleteLabel = useMutation({
    mutationFn: () => labelsApi.deleteLabel(deleteTarget!.id),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
      showToast('Label deleted — removed from every case that had it.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to delete label', 'error'),
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createLabel.mutate();
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="mb-2 flex items-center gap-2">
        <Input
          placeholder="New label name"
          maxLength={20}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="py-1 text-sm"
        />
        <Button type="submit" variant="secondary" disabled={!newName || createLabel.isPending}>
          Add
        </Button>
      </form>
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="space-y-1">
        {labels.map((label) =>
          editingId === label.id ? (
            <form
              key={label.id}
              onSubmit={(e) => {
                e.preventDefault();
                renameLabel.mutate();
              }}
              className="flex items-center gap-1.5"
            >
              <Input
                autoFocus
                maxLength={20}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                className="py-1 text-sm"
              />
              <button type="submit" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                Save
              </button>
              <button type="button" className="text-xs text-slate-500 dark:text-slate-400 hover:underline" onClick={() => setEditingId(null)}>
                Cancel
              </button>
            </form>
          ) : (
            <div key={label.id} className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300">
              <span>{label.name}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditingId(label.id);
                    setEditingName(label.name);
                  }}
                  aria-label={`Rename ${label.name}`}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setDeleteTarget(label)}
                  aria-label={`Delete ${label.name}`}
                  className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/50 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ),
        )}
        {labels.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No labels yet.</p>}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteLabel.mutate()}
        title={`Delete label "${deleteTarget?.name}"?`}
        confirmLabel="Delete label"
        confirming={deleteLabel.isPending}
        message="This removes the label from every test case it's currently applied to. The cases themselves are not affected."
      />
    </div>
  );
}
