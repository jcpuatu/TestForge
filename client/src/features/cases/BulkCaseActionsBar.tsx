import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as casesApi from '../../api/cases';
import type { CaseType, Label, Priority, Section } from '../../api/types';
import { Button } from '../../components/Button';
import { Select } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/apiClient';
import { PRIORITIES, TYPES } from './CaseForm';

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function BulkCaseActionsBar({
  suiteId,
  selectedIds,
  sections,
  labels,
  canDelete,
  onDone,
}: {
  suiteId: string;
  selectedIds: string[];
  sections: Section[];
  labels: Label[];
  canDelete: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editPriority, setEditPriority] = useState<Priority | ''>('');
  const [editType, setEditType] = useState<CaseType | ''>('');
  const [editSectionId, setEditSectionId] = useState('');
  const [pickedLabelIds, setPickedLabelIds] = useState<string[]>([]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['sections'] });
    queryClient.invalidateQueries({ queryKey: ['suites', suiteId, 'cases'] });
  }

  const bulkUpdate = useMutation({
    mutationFn: () =>
      casesApi.bulkUpdateCases(selectedIds, {
        priority: editPriority || undefined,
        type: editType || undefined,
        sectionId: editSectionId || undefined,
      }),
    onSuccess: (data) => {
      setEditOpen(false);
      setEditPriority('');
      setEditType('');
      setEditSectionId('');
      invalidate();
      onDone();
      showToast(`Updated ${data.updated} test case(s).`);
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to update cases', 'error'),
  });

  const bulkAddLabels = useMutation({
    mutationFn: () => casesApi.bulkAddLabels(selectedIds, pickedLabelIds),
    onSuccess: (data) => {
      setLabelsOpen(false);
      setPickedLabelIds([]);
      invalidate();
      onDone();
      showToast(`Added labels to ${data.updated} test case(s).`);
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to add labels', 'error'),
  });

  const bulkDelete = useMutation({
    mutationFn: () => casesApi.bulkDeleteCases(selectedIds),
    onSuccess: (data) => {
      setDeleteOpen(false);
      invalidate();
      onDone();
      showToast(`Deleted ${data.deleted} test case(s).`);
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to delete cases', 'error'),
  });

  return (
    <div className="mb-3 flex items-center gap-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2">
      <span className="text-xs text-slate-600 dark:text-slate-400">{selectedIds.length} selected</span>
      <Button variant="secondary" onClick={() => setEditOpen(true)}>
        Edit
      </Button>
      {labels.length > 0 && (
        <Button variant="secondary" onClick={() => setLabelsOpen(true)}>
          Add labels
        </Button>
      )}
      {canDelete && (
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          Delete
        </Button>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${selectedIds.length} test case(s)`}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Only fields you set below will be changed — leave a field blank to leave it as-is.</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Priority</label>
            <Select value={editPriority} onChange={(e) => setEditPriority(e.target.value as Priority | '')}>
              <option value="">(leave unchanged)</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Type</label>
            <Select value={editType} onChange={(e) => setEditType(e.target.value as CaseType | '')}>
              <option value="">(leave unchanged)</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Move to section</label>
            <Select value={editSectionId} onChange={(e) => setEditSectionId(e.target.value)}>
              <option value="">(leave unchanged)</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bulkUpdate.mutate()}
              disabled={bulkUpdate.isPending || (!editPriority && !editType && !editSectionId)}
            >
              {bulkUpdate.isPending ? 'Applying…' : 'Apply'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={labelsOpen} onClose={() => setLabelsOpen(false)} title={`Add labels to ${selectedIds.length} test case(s)`}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Labels picked here are added on top of whatever each case already has.</p>
          <div className="flex flex-wrap gap-2">
            {labels.map((l) => (
              <label key={l.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={pickedLabelIds.includes(l.id)}
                  onChange={() => setPickedLabelIds((prev) => toggleInArray(prev, l.id))}
                />
                {l.name}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLabelsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => bulkAddLabels.mutate()} disabled={bulkAddLabels.isPending || pickedLabelIds.length === 0}>
              {bulkAddLabels.isPending ? 'Applying…' : 'Apply'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => bulkDelete.mutate()}
        title={`Delete ${selectedIds.length} test case(s)?`}
        confirmLabel="Delete"
        confirming={bulkDelete.isPending}
        message="These test cases will be soft-deleted and can be restored later via Show deleted."
      />
    </div>
  );
}
