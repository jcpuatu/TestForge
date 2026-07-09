import { useState } from 'react';
import { Filter, ArrowDownUp } from 'lucide-react';
import type { CaseFilter } from '../../api/cases';
import { isFilterActive } from '../../api/cases';
import type { DirectoryUser } from '../../api/users';
import type { Label, Section } from '../../api/types';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Select } from '../../components/Input';
import { PRIORITIES, TYPES } from './CaseForm';
import { LabelManager } from './LabelManager';

const SORT_FIELDS: Array<{ value: NonNullable<CaseFilter['sortBy']>; label: string }> = [
  { value: 'orderIndex', label: 'Default order' },
  { value: 'title', label: 'Title' },
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Type' },
  { value: 'createdAt', label: 'Created on' },
];

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function CaseFilterBar({
  sections,
  users,
  labels,
  canManageLabels,
  projectId,
  filter,
  onChange,
}: {
  sections: Section[];
  users: DirectoryUser[];
  labels: Label[];
  canManageLabels: boolean;
  projectId: string;
  filter: CaseFilter;
  onChange: (filter: CaseFilter) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<CaseFilter>(filter);
  const [showLabelManager, setShowLabelManager] = useState(false);

  function openDialog() {
    setDraft(filter);
    setDialogOpen(true);
  }

  function applyDialog() {
    onChange(draft);
    setDialogOpen(false);
  }

  function clearAll() {
    const cleared: CaseFilter = { sortBy: filter.sortBy, sortDir: filter.sortDir };
    onChange(cleared);
    setDraft(cleared);
    setDialogOpen(false);
  }

  const active = isFilterActive(filter);

  return (
    <div className="flex items-center gap-2">
      <Button variant={active ? 'primary' : 'secondary'} onClick={openDialog}>
        <Filter className="h-3.5 w-3.5" />
        Filter{active ? ' (active)' : ''}
      </Button>

      <div className="flex items-center gap-1">
        <ArrowDownUp className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
        <Select
          aria-label="Sort by"
          value={filter.sortBy ?? 'orderIndex'}
          onChange={(e) => onChange({ ...filter, sortBy: e.target.value as CaseFilter['sortBy'] })}
          className="py-1 text-xs"
        >
          {SORT_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Sort direction"
          value={filter.sortDir ?? 'asc'}
          onChange={(e) => onChange({ ...filter, sortDir: e.target.value as CaseFilter['sortDir'] })}
          className="py-1 text-xs"
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </Select>
      </div>

      <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} title="Filter test cases">
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Section</p>
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.sectionIds?.includes(s.id) ?? false}
                    onChange={() => setDraft((d) => ({ ...d, sectionIds: toggleInArray(d.sectionIds ?? [], s.id) }))}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Priority</p>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.priorities?.includes(p) ?? false}
                    onChange={() => setDraft((d) => ({ ...d, priorities: toggleInArray(d.priorities ?? [], p) }))}
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</p>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.types?.includes(t) ?? false}
                    onChange={() => setDraft((d) => ({ ...d, types: toggleInArray(d.types ?? [], t) }))}
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Labels</p>
              {canManageLabels && (
                <button
                  type="button"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  onClick={() => setShowLabelManager((v) => !v)}
                >
                  {showLabelManager ? 'Hide label management' : 'Manage labels'}
                </button>
              )}
            </div>
            {showLabelManager && (
              <div className="mb-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-3">
                <LabelManager projectId={projectId} labels={labels} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {labels.map((l) => (
                <label key={l.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.labelIds?.includes(l.id) ?? false}
                    onChange={() => setDraft((d) => ({ ...d, labelIds: toggleInArray(d.labelIds ?? [], l.id) }))}
                  />
                  {l.name}
                </label>
              ))}
              {labels.length === 0 && !showLabelManager && <p className="text-xs text-slate-400 dark:text-slate-500">No labels yet.</p>}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Created by</p>
            <div className="flex flex-wrap gap-2">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.createdByIds?.includes(u.id) ?? false}
                    onChange={() => setDraft((d) => ({ ...d, createdByIds: toggleInArray(d.createdByIds ?? [], u.id) }))}
                  />
                  {u.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Created on</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Created after"
                className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={draft.createdAfter?.slice(0, 10) ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, createdAfter: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined }))}
              />
              <span className="text-sm text-slate-400 dark:text-slate-500">to</span>
              <input
                type="date"
                aria-label="Created before"
                className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={draft.createdBefore?.slice(0, 10) ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, createdBefore: e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 border-t border-slate-200 pt-3 dark:border-slate-700">
            <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="radio"
                name="match-mode"
                checked={(draft.match ?? 'all') === 'all'}
                onChange={() => setDraft((d) => ({ ...d, match: 'all' }))}
              />
              Match all of the above
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="radio"
                name="match-mode"
                checked={draft.match === 'any'}
                onChange={() => setDraft((d) => ({ ...d, match: 'any' }))}
              />
              Match any of the above
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={clearAll}>
              Clear filter
            </Button>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyDialog}>OK</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
