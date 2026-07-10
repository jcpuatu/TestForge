import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import * as configApi from '../../api/configurations';
import type { ConfigGroup } from '../../api/configurations';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/apiClient';

function AddConfigValue({ groupId, onAdded }: { groupId: string; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => configApi.createConfig(groupId, name),
    onSuccess: () => {
      setName('');
      setError(null);
      onAdded();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to add value'),
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        add.mutate();
      }}
      className="mt-1.5 flex items-center gap-2"
    >
      <Input placeholder="e.g. Chrome" value={name} onChange={(e) => setName(e.target.value)} className="py-1 text-sm" />
      <button type="submit" disabled={!name || add.isPending} className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
        Add value
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </form>
  );
}

export function ConfigurationsManager({ projectId, configGroups }: { projectId: string; configGroups: ConfigGroup[] }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<ConfigGroup | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'config-groups'] });
  }

  const createGroup = useMutation({
    mutationFn: () => configApi.createConfigGroup(projectId, newGroupName),
    onSuccess: () => {
      setNewGroupName('');
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create group'),
  });

  const renameGroup = useMutation({
    mutationFn: () => configApi.updateConfigGroup(editingGroupId!, editingGroupName),
    onSuccess: () => {
      setEditingGroupId(null);
      invalidate();
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to rename group', 'error'),
  });

  const deleteGroup = useMutation({
    mutationFn: () => configApi.deleteConfigGroup(deleteGroupTarget!.id),
    onSuccess: () => {
      setDeleteGroupTarget(null);
      invalidate();
      showToast('Configuration group deleted.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to delete group', 'error'),
  });

  const deleteConfig = useMutation({
    mutationFn: (id: string) => configApi.deleteConfig(id),
    onSuccess: () => invalidate(),
  });

  return (
    <div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          createGroup.mutate();
        }}
        className="mb-3 flex items-center gap-2"
      >
        <Input placeholder="New group name (e.g. Browsers)" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="py-1 text-sm" />
        <Button type="submit" variant="secondary" disabled={!newGroupName || createGroup.isPending}>
          Add group
        </Button>
      </form>
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="space-y-3">
        {configGroups.map((group) => (
          <div key={group.id} className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
            {editingGroupId === group.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  renameGroup.mutate();
                }}
                className="flex items-center gap-2"
              >
                <Input autoFocus value={editingGroupName} onChange={(e) => setEditingGroupName(e.target.value)} className="py-1 text-sm" />
                <button type="submit" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  Save
                </button>
                <button type="button" onClick={() => setEditingGroupId(null)} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{group.name}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditingGroupId(group.id);
                      setEditingGroupName(group.name);
                    }}
                    aria-label={`Rename ${group.name}`}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteGroupTarget(group)}
                    aria-label={`Delete ${group.name}`}
                    className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/50 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.configs.map((c) => (
                <span
                  key={c.id}
                  className="flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300"
                >
                  {c.name}
                  <button onClick={() => deleteConfig.mutate(c.id)} aria-label={`Delete ${c.name}`} className="text-slate-400 hover:text-red-600 dark:hover:text-red-400">
                    ×
                  </button>
                </span>
              ))}
              {group.configs.length === 0 && <span className="text-xs text-slate-400 dark:text-slate-500">No values yet.</span>}
            </div>
            <AddConfigValue groupId={group.id} onAdded={invalidate} />
          </div>
        ))}
        {configGroups.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No configuration groups yet.</p>}
      </div>

      <ConfirmDialog
        open={!!deleteGroupTarget}
        onClose={() => setDeleteGroupTarget(null)}
        onConfirm={() => deleteGroup.mutate()}
        title={`Delete "${deleteGroupTarget?.name}"?`}
        confirmLabel="Delete group"
        confirming={deleteGroup.isPending}
        message="This deletes the group and all its values. Runs already created from these values keep their existing label — it isn't a live link."
      />
    </div>
  );
}
