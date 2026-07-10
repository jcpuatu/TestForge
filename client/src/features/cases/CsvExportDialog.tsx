import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import type { Section } from '../../api/types';

const COLUMNS: { key: string; label: string }[] = [
  { key: 'section', label: 'Sections Hierarchy' },
  { key: 'title', label: 'Title' },
  { key: 'priority', label: 'Priority' },
  { key: 'type', label: 'Type' },
  { key: 'preconditions', label: 'Preconditions' },
  { key: 'steps', label: 'Steps' },
  { key: 'expectedResult', label: 'Expected Result' },
  { key: 'referenceLink', label: 'Reference Link' },
];

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

interface CsvExportDialogProps {
  open: boolean;
  onClose: () => void;
  sections: Array<Section & { depth: number }>;
  onExport: (options: { sectionIds: string[]; columns: string[] }) => void;
}

export function CsvExportDialog({ open, onClose, sections, onExport }: CsvExportDialogProps) {
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>(COLUMNS.map((c) => c.key));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export CSV"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onExport({ sectionIds, columns });
              onClose();
            }}
          >
            Export
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Sections</span>
            <button
              type="button"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => setSectionIds(sectionIds.length === sections.length ? [] : sections.map((s) => s.id))}
            >
              {sectionIds.length === sections.length && sections.length > 0 ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">Leave all unchecked to export every section.</p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-700">
            {sections.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300"
                style={{ paddingLeft: s.depth * 14 }}
              >
                <input
                  type="checkbox"
                  checked={sectionIds.includes(s.id)}
                  onChange={() => setSectionIds((ids) => toggleInArray(ids, s.id))}
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Columns</span>
          <div className="grid grid-cols-2 gap-1">
            {COLUMNS.map((c) => (
              <label key={c.key} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={columns.includes(c.key)}
                  disabled={c.key === 'title'}
                  onChange={() => setColumns((cols) => toggleInArray(cols, c.key))}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
