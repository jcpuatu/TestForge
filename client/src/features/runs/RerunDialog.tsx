import { useState } from 'react';
import type { ResultStatus } from '../../api/runs';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Field, Input, Label } from '../../components/Input';

const ALL_STATUSES: ResultStatus[] = ['FAILED', 'BLOCKED', 'RETEST', 'PASSED', 'UNTESTED'];

export function RerunDialog({
  open,
  onClose,
  onSubmit,
  submitting,
  showNameField,
  defaultName,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { statuses: ResultStatus[]; copyAssignees: boolean; name?: string }) => void;
  submitting: boolean;
  showNameField?: boolean;
  defaultName?: string;
}) {
  // Failed/Blocked/Retest matches TestRail's own default rerun selection — the statuses that
  // actually warrant re-testing, not everything.
  const [statuses, setStatuses] = useState<ResultStatus[]>(['FAILED', 'BLOCKED', 'RETEST']);
  const [copyAssignees, setCopyAssignees] = useState(true);
  const [name, setName] = useState(defaultName ?? '');

  function toggleStatus(s: ResultStatus) {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s]));
  }

  return (
    <Modal open={open} onClose={onClose} title="Rerun">
      <div className="space-y-3">
        {showNameField && (
          <Field>
            <Label htmlFor="rerun-name">New run name</Label>
            <Input id="rerun-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} />
          </Field>
        )}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Carry over tests with status
          </p>
          <div className="flex flex-wrap gap-2">
            {ALL_STATUSES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} />
                {s}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={copyAssignees} onChange={(e) => setCopyAssignees(e.target.checked)} />
          Copy assigned to
        </label>
        <div className="flex gap-2">
          <Button
            disabled={statuses.length === 0 || submitting}
            onClick={() => onSubmit({ statuses, copyAssignees, name: showNameField ? name || undefined : undefined })}
          >
            {submitting ? 'Creating…' : 'Rerun'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
