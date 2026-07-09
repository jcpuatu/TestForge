import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CaseInput } from '../../api/cases';
import * as sharedStepsApi from '../../api/sharedSteps';
import type { CaseTemplate, CaseType, Label as CaseLabel, Priority, SharedStepSet, TestCase } from '../../api/types';
import { Button } from '../../components/Button';
import { Field, Input, Label, Select, Textarea } from '../../components/Input';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/apiClient';
import { stepsToText, textToSteps } from './stepsText';
import { bddLinesToText, textToBddLines } from './bddLinesText';

export const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const TYPES: CaseType[] = [
  'FUNCTIONAL',
  'SMOKE',
  'REGRESSION',
  'PERFORMANCE',
  'SECURITY',
  'USABILITY',
  'ACCEPTANCE',
  'OTHER',
];

const TEMPLATES: Array<{ value: CaseTemplate; label: string }> = [
  { value: 'TEXT', label: 'Test Case (Text)' },
  { value: 'STEPS', label: 'Test Case (Steps)' },
  { value: 'EXPLORATORY', label: 'Exploratory Session' },
  { value: 'BDD', label: 'BDD Scenario' },
];

interface CaseFormProps {
  initial?: TestCase;
  availableLabels?: CaseLabel[];
  availableSharedStepSets?: SharedStepSet[];
  submitting?: boolean;
  onSubmit: (input: CaseInput) => void;
  onCancel: () => void;
}

export function CaseForm({
  initial,
  availableLabels = [],
  availableSharedStepSets = [],
  submitting,
  onSubmit,
  onCancel,
}: CaseFormProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [template, setTemplate] = useState<CaseTemplate>(initial?.template ?? 'TEXT');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'MEDIUM');
  const [type, setType] = useState<CaseType>(initial?.type ?? 'FUNCTIONAL');
  const [preconditions, setPreconditions] = useState(initial?.preconditions ?? '');
  // TEXT template stores one freeform block of instructions (no per-step rows); STEPS keeps the
  // existing "step | expected result" per-line format. Separate state so switching templates
  // doesn't garble one format into the other.
  const [textSteps, setTextSteps] = useState(initial?.template !== 'STEPS' ? (initial?.steps?.[0]?.step ?? '') : '');
  const [stepsText, setStepsText] = useState(initial?.template === 'STEPS' ? stepsToText(initial?.steps) : '');
  const [expectedResult, setExpectedResult] = useState(initial?.expectedResult ?? '');
  const [mission, setMission] = useState(initial?.mission ?? '');
  const [goals, setGoals] = useState(initial?.goals ?? '');
  const [bddText, setBddText] = useState(bddLinesToText(initial?.bddLines));
  const [estimate, setEstimate] = useState(initial?.estimate ?? '');
  const [referenceLink, setReferenceLink] = useState(initial?.referenceLink ?? '');
  const [labelIds, setLabelIds] = useState<string[]>(initial?.labels.map((l) => l.id) ?? []);
  const [sharedStepSetIds, setSharedStepSetIds] = useState<string[]>(initial?.sharedSteps.map((s) => s.id) ?? []);
  const [promoteName, setPromoteName] = useState('');
  const [showPromote, setShowPromote] = useState(false);

  function toggleLabel(id: string) {
    setLabelIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= 10) return prev; // matches TestRail's 10-label cap
      return [...prev, id];
    });
  }

  function toggleSharedStepSet(id: string) {
    setSharedStepSetIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  // A side-action separate from the form's own save flow — it mutates the case immediately
  // (clearing its literal steps server-side and linking the new set) rather than going through
  // onSubmit, so it needs its own mutation here instead of assembling into CaseInput.
  const promoteSteps = useMutation({
    mutationFn: () => sharedStepsApi.promoteCaseSteps(initial!.id, promoteName),
    onSuccess: (res) => {
      setStepsText('');
      setSharedStepSetIds((prev) => [...prev, res.sharedStepSet.id]);
      setShowPromote(false);
      setPromoteName('');
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey.some((k) => k === 'cases' || k === 'shared-step-sets'),
      });
      showToast(`"${res.sharedStepSet.name}" created from this case's steps.`);
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to promote steps', 'error'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const hasStepFields = template === 'TEXT' || template === 'STEPS';
    onSubmit({
      title,
      template,
      preconditions: hasStepFields ? preconditions || undefined : undefined,
      steps:
        template === 'STEPS'
          ? textToSteps(stepsText)
          : template === 'TEXT' && textSteps
            ? [{ step: textSteps }]
            : undefined,
      expectedResult: hasStepFields ? expectedResult || undefined : undefined,
      mission: template === 'EXPLORATORY' ? mission || undefined : undefined,
      goals: template === 'EXPLORATORY' ? goals || undefined : undefined,
      bddLines: template === 'BDD' ? textToBddLines(bddText) : undefined,
      priority,
      type,
      estimate: estimate || undefined,
      referenceLink: referenceLink || undefined,
      labelIds,
      sharedStepSetIds,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <Field>
        <Label htmlFor="case-title">Title</Label>
        <Input id="case-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field>
        <Label htmlFor="case-template">Template</Label>
        <Select id="case-template" value={template} onChange={(e) => setTemplate(e.target.value as CaseTemplate)}>
          {TEMPLATES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
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
      {template === 'BDD' ? (
        <Field>
          <Label htmlFor="case-bdd">Scenario steps (one per line — "Given/When/Then/And/But …")</Label>
          <Textarea
            id="case-bdd"
            rows={5}
            placeholder={'Given I am on the login page\nWhen I enter valid credentials\nThen I should see the dashboard'}
            value={bddText}
            onChange={(e) => setBddText(e.target.value)}
          />
        </Field>
      ) : template === 'EXPLORATORY' ? (
        <>
          <Field>
            <Label htmlFor="case-mission">Mission</Label>
            <Textarea
              id="case-mission"
              rows={2}
              placeholder="What are you trying to find out in this session?"
              value={mission}
              onChange={(e) => setMission(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="case-goals">Goals</Label>
            <Textarea
              id="case-goals"
              rows={3}
              placeholder="Areas to cover, risks to probe, questions to answer"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field>
            <Label htmlFor="case-preconditions">Preconditions</Label>
            <Textarea
              id="case-preconditions"
              rows={2}
              value={preconditions}
              onChange={(e) => setPreconditions(e.target.value)}
            />
          </Field>
          {template === 'STEPS' ? (
            <>
              <Field>
                <Label htmlFor="case-steps">Steps (one per line — "step | expected result")</Label>
                <Textarea id="case-steps" rows={4} value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
              </Field>
              {initial && stepsText.trim() && (
                <Field>
                  {showPromote ? (
                    <div className="flex items-center gap-2">
                      <Input
                        autoFocus
                        placeholder="Shared step set name"
                        value={promoteName}
                        onChange={(e) => setPromoteName(e.target.value)}
                        className="py-1 text-sm"
                      />
                      <button
                        type="button"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                        disabled={!promoteName || promoteSteps.isPending}
                        onClick={() => promoteSteps.mutate()}
                      >
                        {promoteSteps.isPending ? 'Promoting…' : 'Create'}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
                        onClick={() => setShowPromote(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      onClick={() => setShowPromote(true)}
                    >
                      Promote these steps to a reusable shared step set
                    </button>
                  )}
                </Field>
              )}
              {availableSharedStepSets.length > 0 && (
                <Field>
                  <Label>Shared step sets (appended after the steps above)</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableSharedStepSets.map((s) => (
                      <label key={s.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={sharedStepSetIds.includes(s.id)}
                          onChange={() => toggleSharedStepSet(s.id)}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </Field>
              )}
            </>
          ) : (
            <Field>
              <Label htmlFor="case-steps">Steps</Label>
              <Textarea id="case-steps" rows={4} value={textSteps} onChange={(e) => setTextSteps(e.target.value)} />
            </Field>
          )}
          <Field>
            <Label htmlFor="case-expected">Overall expected result</Label>
            <Textarea
              id="case-expected"
              rows={2}
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
            />
          </Field>
        </>
      )}
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
      {availableLabels.length > 0 && (
        <Field>
          <Label>Labels ({labelIds.length}/10)</Label>
          <div className="flex flex-wrap gap-2">
            {availableLabels.map((l) => (
              <label key={l.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={labelIds.includes(l.id)}
                  disabled={!labelIds.includes(l.id) && labelIds.length >= 10}
                  onChange={() => toggleLabel(l.id)}
                />
                {l.name}
              </label>
            ))}
          </div>
        </Field>
      )}
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
