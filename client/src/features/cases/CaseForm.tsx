import { useState, type FormEvent } from 'react';
import type { CaseInput } from '../../api/cases';
import type { CaseType, Priority, TestCase } from '../../api/types';
import { Button } from '../../components/Button';
import { Field, Input, Label, Select, Textarea } from '../../components/Input';
import { stepsToText, textToSteps } from './stepsText';

const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const TYPES: CaseType[] = [
  'FUNCTIONAL',
  'SMOKE',
  'REGRESSION',
  'PERFORMANCE',
  'SECURITY',
  'USABILITY',
  'ACCEPTANCE',
  'OTHER',
];

interface CaseFormProps {
  initial?: TestCase;
  submitting?: boolean;
  onSubmit: (input: CaseInput) => void;
  onCancel: () => void;
}

export function CaseForm({ initial, submitting, onSubmit, onCancel }: CaseFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'MEDIUM');
  const [type, setType] = useState<CaseType>(initial?.type ?? 'FUNCTIONAL');
  const [preconditions, setPreconditions] = useState(initial?.preconditions ?? '');
  const [stepsText, setStepsText] = useState(stepsToText(initial?.steps));
  const [expectedResult, setExpectedResult] = useState(initial?.expectedResult ?? '');
  const [estimate, setEstimate] = useState(initial?.estimate ?? '');
  const [referenceLink, setReferenceLink] = useState(initial?.referenceLink ?? '');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      title,
      priority,
      type,
      preconditions: preconditions || undefined,
      steps: textToSteps(stepsText),
      expectedResult: expectedResult || undefined,
      estimate: estimate || undefined,
      referenceLink: referenceLink || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <Field>
        <Label htmlFor="case-title">Title</Label>
        <Input id="case-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <Label htmlFor="case-priority">Priority</Label>
          <Select id="case-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="case-type">Type</Label>
          <Select id="case-type" value={type} onChange={(e) => setType(e.target.value as CaseType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field>
        <Label htmlFor="case-preconditions">Preconditions</Label>
        <Textarea
          id="case-preconditions"
          rows={2}
          value={preconditions}
          onChange={(e) => setPreconditions(e.target.value)}
        />
      </Field>
      <Field>
        <Label htmlFor="case-steps">Steps (one per line — "step | expected result")</Label>
        <Textarea id="case-steps" rows={4} value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
      </Field>
      <Field>
        <Label htmlFor="case-expected">Overall expected result</Label>
        <Textarea
          id="case-expected"
          rows={2}
          value={expectedResult}
          onChange={(e) => setExpectedResult(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <Label htmlFor="case-estimate">Estimate</Label>
          <Input id="case-estimate" placeholder="e.g. 10s, 2m, 1h" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
        </Field>
        <Field>
          <Label htmlFor="case-reference">References</Label>
          <Input id="case-reference" placeholder="REQ-1, REQ-2" value={referenceLink} onChange={(e) => setReferenceLink(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
