import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bug, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import * as runsApi from '../../api/runs';
import type { ResultStatus, TestRun } from '../../api/runs';
import * as usersApi from '../../api/users';
import type { DirectoryUser } from '../../api/users';
import * as defectsApi from '../../api/defects';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { PriorityBadge, StatusBadge } from '../../components/Badge';
import { DefectText } from '../../components/DefectText';
import { Field, Input, Label, Select, Textarea } from '../../components/Input';
import { StackedStatusBar, StatusLegend } from '../../components/StackedStatusBar';
import { PrintButton } from '../../components/PrintButton';
import { DraftDefectPanel } from './DraftDefectPanel';
import { RerunDialog } from './RerunDialog';
import { ResultAttachments } from './ResultAttachments';

// PASSED isn't in this list — it's the dedicated "Pass & Next" button instead (matches real
// TestRail: pass is always the fast, advancing path; the others are deliberate second choices).
const STATUS_OPTIONS: ResultStatus[] = ['FAILED', 'BLOCKED', 'RETEST'];
const STATUS_BUTTON_CLASSES: Record<ResultStatus, string> = {
  UNTESTED: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
  PASSED: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800/60 border border-emerald-200 dark:border-emerald-800',
  FAILED: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-800/60 border border-red-200 dark:border-red-800',
  BLOCKED: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-800/60 border border-orange-200 dark:border-orange-800',
  RETEST: 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-800/60 border border-cyan-200 dark:border-cyan-800',
};

interface AppliedFilter {
  userIds: Set<string>;
  showUnassigned: boolean;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function SummaryBar({ summary }: { summary: runsApi.RunSummary }) {
  if (summary.total === 0) return null;
  return (
    <div className="mb-4">
      <StackedStatusBar counts={summary.counts} total={summary.total} height={10} />
      <div className="mt-1.5 flex items-center gap-4">
        <StatusLegend counts={summary.counts} />
        <span className="text-xs text-slate-400 dark:text-slate-500">Total: {summary.total}</span>
      </div>
    </div>
  );
}

// Mirrors TestRail's real "Filter By User" panel: check specific users (or use the
// Me/All/None shortcuts), optionally include Unassigned, then click Filter User to apply.
// Nothing here re-filters live as you click checkboxes — matches TestRail's actual behavior.
function FilterByUser({
  directory,
  currentUserId,
  appliedFilter,
  onApply,
  onClear,
}: {
  directory: DirectoryUser[];
  currentUserId: string | undefined;
  appliedFilter: AppliedFilter | null;
  onApply: (filter: AppliedFilter) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [showUnassigned, setShowUnassigned] = useState(false);

  function toggleUser(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="no-print mb-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Filter by user
          {appliedFilter && (
            <span className="rounded bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">Active</span>
          )}
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Select:</span>
            <button className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setCheckedIds(new Set(currentUserId ? [currentUserId] : []))}>
              Me
            </button>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <button className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setCheckedIds(new Set(directory.map((u) => u.id)))}>
              All
            </button>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <button className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setCheckedIds(new Set())}>
              None
            </button>
          </div>

          <label className="mb-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={showUnassigned} onChange={(e) => setShowUnassigned(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600" />
            Show unassigned
          </label>

          <div className="mb-3 max-h-40 space-y-1 overflow-y-auto border-t border-slate-100 dark:border-slate-800 pt-2">
            {directory.map((u) => (
              <label key={u.id} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <input type="checkbox" checked={checkedIds.has(u.id)} onChange={() => toggleUser(u.id)} className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600" />
                {u.id === currentUserId ? `${u.name} (me)` : u.name}
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => onApply({ userIds: checkedIds, showUnassigned })}>Filter User</Button>
            {appliedFilter && (
              <button
                className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
                onClick={() => {
                  setCheckedIds(new Set());
                  setShowUnassigned(false);
                  onClear();
                }}
              >
                Clear filter
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TestRow({
  test,
  run,
  canSubmit,
  canAssign,
  directory,
  currentUserId,
  currentUserName,
  knownDefectIds,
  selected,
  onToggleSelect,
  expanded,
  onToggleExpand,
  onAdvance,
}: {
  test: runsApi.RunCase;
  run: TestRun;
  canSubmit: boolean;
  canAssign: boolean;
  directory: DirectoryUser[];
  currentUserId: string | undefined;
  currentUserName: string | undefined;
  knownDefectIds: string[];
  selected: boolean;
  onToggleSelect: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onAdvance: () => void;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [defects, setDefects] = useState('');
  const [showDraft, setShowDraft] = useState(false);
  const [stepStatuses, setStepStatuses] = useState<Record<number, ResultStatus>>({});
  const [stepActuals, setStepActuals] = useState<Record<number, string>>({});
  const [submitAssigneeId, setSubmitAssigneeId] = useState(test.assignedTo?.id ?? '');
  const [version, setVersion] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState('');
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [timerTick, setTimerTick] = useState(0);

  const resultsQuery = useQuery({
    queryKey: ['tests', test.id, 'results'],
    queryFn: () => runsApi.listResults(test.id),
    enabled: expanded,
  });

  // Re-renders once a second while the timer is running so the live "M:SS" display advances;
  // the tick value itself is never read, only its identity change matters.
  useEffect(() => {
    if (timerStartedAt === null) return;
    const interval = setInterval(() => setTimerTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timerStartedAt]);

  function toggleTimer() {
    if (timerStartedAt === null) {
      setTimerStartedAt(Date.now());
    } else {
      setElapsedSeconds(String(Math.floor((Date.now() - timerStartedAt) / 1000)));
      setTimerStartedAt(null);
    }
  }

  const liveSeconds = timerStartedAt !== null ? Math.floor((Date.now() - timerStartedAt) / 1000) : null;

  const submitResult = useMutation({
    mutationFn: (status: ResultStatus) => {
      const stepResults =
        test.templateSnapshot === 'STEPS' && test.stepsSnapshot && test.stepsSnapshot.length > 0
          ? test.stepsSnapshot.map((_, i) => ({ status: stepStatuses[i] ?? 'UNTESTED', actual: stepActuals[i] || undefined }))
          : undefined;
      const elapsedMs = elapsedSeconds ? Number(elapsedSeconds) * 1000 : undefined;
      return runsApi.submitResult(test.id, {
        status,
        comment: comment || undefined,
        defects: defects || undefined,
        version: version || undefined,
        elapsedMs,
        stepResults,
      });
    },
    onSuccess: () => {
      setComment('');
      setDefects('');
      setVersion('');
      setElapsedSeconds('');
      setTimerStartedAt(null);
      setStepStatuses({});
      setStepActuals({});
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['tests', test.id, 'results'] });
    },
  });

  function submitStatus(status: ResultStatus, advance?: boolean) {
    if (submitAssigneeId !== (test.assignedTo?.id ?? '')) {
      reassign.mutate(submitAssigneeId || null);
    }
    submitResult.mutate(status, advance ? { onSuccess: () => onAdvance() } : undefined);
  }

  // Keyboard shortcuts only act on the currently-expanded row, and only while a text field isn't
  // focused (so typing "pass" into the Comment box doesn't fire a submit). P is treated as
  // "Pass & Next" since a keyboard-driven flow is precisely for rapid sequential testing; F/B/R
  // don't auto-advance since a failure usually needs a comment/defect added before moving on.
  useEffect(() => {
    if (!expanded || !canSubmit) return;
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const map: Partial<Record<string, ResultStatus>> = { p: 'PASSED', f: 'FAILED', b: 'BLOCKED', r: 'RETEST' };
      const status = map[e.key.toLowerCase()];
      if (status) {
        e.preventDefault();
        submitStatus(status, status === 'PASSED');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, canSubmit, submitAssigneeId, test.id, test.assignedTo?.id]);

  const reassign = useMutation({
    mutationFn: (assignedToId: string | null) => runsApi.reassignTest(test.id, assignedToId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', test.runId, 'tests'] }),
  });

  const hasOpenDefect = (test.status === 'FAILED' || test.status === 'BLOCKED') && !!test.latestDefects;

  return (
    <div id={`test-row-${test.id}`} className="border-b border-slate-200 dark:border-slate-700 p-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        {canAssign && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 shrink-0 rounded border-slate-300 dark:border-slate-600"
            aria-label={`Select ${test.titleSnapshot}`}
          />
        )}
        <button className="flex flex-1 items-center gap-2 text-left" onClick={onToggleExpand}>
          <PriorityBadge priority={test.priority} />
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{test.titleSnapshot}</span>
          {hasOpenDefect && <Bug className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" aria-label="Has linked defect" />}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {canAssign ? (
            <Select
              value={test.assignedTo?.id ?? ''}
              onChange={(e) => reassign.mutate(e.target.value || null)}
              className="w-36 py-1 text-xs"
            >
              <option value="">Unassigned</option>
              {directory.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === currentUserId ? `${u.name} (me)` : u.name}
                </option>
              ))}
            </Select>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">{test.assignedTo?.name ?? 'Unassigned'}</span>
          )}
          <StatusBadge status={test.status} />
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          {test.templateSnapshot === 'BDD' ? (
            test.bddLinesSnapshot &&
            test.bddLinesSnapshot.length > 0 && (
              <ol className="ml-5 list-none space-y-0.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                {test.bddLinesSnapshot.map((line, i) => (
                  <li key={i}>
                    <span className="font-semibold text-blue-700 dark:text-blue-400">{line.keyword}</span> {line.text}
                  </li>
                ))}
              </ol>
            )
          ) : test.templateSnapshot === 'EXPLORATORY' ? (
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              {test.missionSnapshot && (
                <p>
                  <span className="font-medium text-slate-700 dark:text-slate-300">Mission: </span>
                  {test.missionSnapshot}
                </p>
              )}
              {test.goalsSnapshot && (
                <p className="whitespace-pre-line">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Goals: </span>
                  {test.goalsSnapshot}
                </p>
              )}
            </div>
          ) : test.templateSnapshot === 'TEXT' ? (
            test.stepsSnapshot &&
            test.stepsSnapshot.length > 0 && (
              <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">{test.stepsSnapshot[0].step}</p>
            )
          ) : (
            test.stepsSnapshot &&
            test.stepsSnapshot.length > 0 &&
            (canSubmit ? (
              <div className="space-y-1.5">
                {test.stepsSnapshot.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 w-4 shrink-0 text-slate-400 dark:text-slate-500">{i + 1}.</span>
                    <div className="flex-1">
                      <p className="text-slate-600 dark:text-slate-400">
                        {step.step}
                        {step.expected && <span className="text-slate-400 dark:text-slate-500"> → {step.expected}</span>}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="w-32 shrink-0">
                          <Select
                            aria-label={`Step ${i + 1} status`}
                            value={stepStatuses[i] ?? 'UNTESTED'}
                            onChange={(e) => setStepStatuses((prev) => ({ ...prev, [i]: e.target.value as ResultStatus }))}
                            className="py-1 text-xs"
                          >
                            {(['UNTESTED', ...STATUS_OPTIONS] as ResultStatus[]).map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Input
                          aria-label={`Step ${i + 1} actual result`}
                          placeholder="Actual result (optional)"
                          value={stepActuals[i] ?? ''}
                          onChange={(e) => setStepActuals((prev) => ({ ...prev, [i]: e.target.value }))}
                          className="flex-1 py-1 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ol className="ml-5 list-decimal text-sm text-slate-600 dark:text-slate-400">
                {test.stepsSnapshot.map((step, i) => (
                  <li key={i}>
                    {step.step}
                    {step.expected && <span className="text-slate-400 dark:text-slate-500"> → {step.expected}</span>}
                  </li>
                ))}
              </ol>
            ))
          )}

          {canSubmit && (
            <div className="rounded-md bg-slate-50 dark:bg-slate-700 p-3">
              <Field>
                <Label htmlFor={`comment-${test.id}`}>Comment</Label>
                <Textarea id={`comment-${test.id}`} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
              </Field>
              <Field>
                <Label htmlFor={`defects-${test.id}`}>Defect IDs (optional)</Label>
                <Input
                  id={`defects-${test.id}`}
                  list={`defect-suggestions-${test.id}`}
                  placeholder="BUG-123"
                  value={defects}
                  onChange={(e) => setDefects(e.target.value)}
                />
                <datalist id={`defect-suggestions-${test.id}`}>
                  {knownDefectIds.map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label htmlFor={`version-${test.id}`}>Version (optional)</Label>
                  <Input id={`version-${test.id}`} placeholder="1.2.3" value={version} onChange={(e) => setVersion(e.target.value)} />
                </Field>
                <Field>
                  <Label htmlFor={`elapsed-${test.id}`}>Elapsed (seconds)</Label>
                  <div className="flex items-center gap-2">
                    <div className="w-24">
                      <Input
                        id={`elapsed-${test.id}`}
                        type="number"
                        min={0}
                        placeholder="0"
                        value={timerStartedAt !== null ? String(liveSeconds) : elapsedSeconds}
                        disabled={timerStartedAt !== null}
                        onChange={(e) => setElapsedSeconds(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={toggleTimer}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                        timerStartedAt !== null
                          ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                          : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                      }`}
                    >
                      {timerStartedAt !== null ? 'Stop timer' : 'Start timer'}
                    </button>
                  </div>
                </Field>
              </div>
              {canAssign && (
                <Field>
                  <Label htmlFor={`submit-assignee-${test.id}`}>Assign to</Label>
                  <Select
                    id={`submit-assignee-${test.id}`}
                    value={submitAssigneeId}
                    onChange={(e) => setSubmitAssigneeId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {directory.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.id === currentUserId ? `${u.name} (me)` : u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={submitResult.isPending}
                  onClick={() => submitStatus('PASSED', true)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Pass &amp; Next
                </button>
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    disabled={submitResult.isPending}
                    onClick={() => submitStatus(status)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${STATUS_BUTTON_CLASSES[status]}`}
                  >
                    {status}
                  </button>
                ))}
                <span className="text-xs text-slate-400 dark:text-slate-500">Shortcuts: P/F/B/R</span>
                <button
                  type="button"
                  onClick={() => setShowDraft((v) => !v)}
                  className="ml-auto flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Bug className="h-3.5 w-3.5" />
                  Draft defect for Jira
                </button>
              </div>
              {showDraft && (
                <div className="mt-3">
                  <DraftDefectPanel
                    test={test}
                    run={run}
                    draftComment={comment || test.latestComment || undefined}
                    reporterName={currentUserName}
                    onClose={() => setShowDraft(false)}
                  />
                </div>
              )}
            </div>
          )}

          {resultsQuery.data && resultsQuery.data.results.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">History</h4>
              <div className="space-y-1.5">
                {resultsQuery.data.results.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <StatusBadge status={r.status} />
                    <div>
                      <p>
                        {r.comment} {r.defects && <DefectText value={r.defects} />}
                      </p>
                      {r.stepResults && r.stepResults.length > 0 && (
                        <ol className="ml-4 mt-0.5 list-decimal space-y-0.5">
                          {r.stepResults.map((sr, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <StatusBadge status={sr.status} />
                              {sr.actual && <span>{sr.actual}</span>}
                            </li>
                          ))}
                        </ol>
                      )}
                      <p className="text-slate-400 dark:text-slate-500">
                        {r.enteredBy?.name} · {new Date(r.createdAt).toLocaleString()}
                        {r.version && <> · v{r.version}</>}
                        {r.elapsedMs != null && <> · {formatElapsed(r.elapsedMs)}</>}
                      </p>
                      <div className="mt-1">
                        <ResultAttachments resultId={r.id} canManage={canSubmit && !run.isCompleted} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RunExecutionPage() {
  const { runId } = useParams<{ runId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canSubmit = user?.role === 'ADMIN' || user?.role === 'LEAD' || user?.role === 'TESTER';
  const canManage = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssigneeId, setBulkAssigneeId] = useState('');
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter | null>(null);
  const [filterAssigneeId, setFilterAssigneeId] = useState('');
  const [editingDates, setEditingDates] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showRerun, setShowRerun] = useState(false);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);

  const runQuery = useQuery({ queryKey: ['runs', runId], queryFn: () => runsApi.getRun(runId!), enabled: !!runId });
  const testsQuery = useQuery({ queryKey: ['runs', runId, 'tests'], queryFn: () => runsApi.listTests(runId!), enabled: !!runId });
  const summaryQuery = useQuery({
    queryKey: ['runs', runId, 'summary'],
    queryFn: () => runsApi.getRunSummary(runId!),
    enabled: !!runId,
  });
  const directoryQuery = useQuery({ queryKey: ['users', 'directory'], queryFn: usersApi.listUserDirectory });
  const defectsQuery = useQuery({
    queryKey: ['projects', runQuery.data?.run.projectId, 'defects'],
    queryFn: () => defectsApi.listProjectDefects(runQuery.data!.run.projectId),
    enabled: !!runQuery.data,
  });

  const closeRun = useMutation({
    mutationFn: () => runsApi.closeRun(runId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', runId] }),
  });
  const reopenRun = useMutation({
    mutationFn: () => runsApi.reopenRun(runId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', runId] }),
  });

  const updateDates = useMutation({
    mutationFn: () =>
      runsApi.updateRun(runId!, {
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
      }),
    onSuccess: () => {
      setEditingDates(false);
      queryClient.invalidateQueries({ queryKey: ['runs', runId] });
    },
  });

  const rerun = useMutation({
    mutationFn: (input: { statuses: ResultStatus[]; copyAssignees: boolean }) => runsApi.rerunRun(runId!, input),
    onSuccess: (res) => {
      setShowRerun(false);
      navigate(`/runs/${res.run.id}`);
    },
  });

  const bulkAssign = useMutation({
    mutationFn: (vars: { testIds: string[]; assignedToId: string | null }) =>
      runsApi.bulkAssignTests(runId!, vars.testIds, vars.assignedToId),
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkAssigneeId('');
      setFilterAssigneeId('');
      queryClient.invalidateQueries({ queryKey: ['runs', runId, 'tests'] });
    },
  });

  const bulkResult = useMutation({
    mutationFn: (vars: { testIds: string[]; status: ResultStatus }) => runsApi.bulkSubmitResults(runId!, vars.testIds, vars.status),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['runs', runId, 'tests'] });
      queryClient.invalidateQueries({ queryKey: ['runs', runId, 'summary'] });
    },
  });

  if (!runQuery.data) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
  const run = runQuery.data.run;
  const knownDefectIds = defectsQuery.data?.defects.map((d) => d.id) ?? [];
  const allTests = testsQuery.data?.tests ?? [];
  const canBulkAssign = canSubmit && !run.isCompleted;

  const visibleTests = appliedFilter
    ? allTests.filter(
        (t) => (t.assignedToId && appliedFilter.userIds.has(t.assignedToId)) || (appliedFilter.showUnassigned && !t.assignedToId),
      )
    : allTests;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === visibleTests.length ? new Set() : new Set(visibleTests.map((t) => t.id))));
  }

  // Pass & Next: jump to the next UNTESTED test after the one just submitted, wrapping to the
  // start of the visible list. Computed against the pre-refetch `visibleTests` snapshot still in
  // this closure — invalidation triggers a background refetch, not a synchronous one, so this
  // reflects what the user saw right before submitting, which is what "next" should mean here.
  function advanceToNext(afterTestId: string) {
    const idx = visibleTests.findIndex((t) => t.id === afterTestId);
    const next =
      visibleTests.slice(idx + 1).find((t) => t.status === 'UNTESTED') ??
      visibleTests.find((t) => t.id !== afterTestId && t.status === 'UNTESTED');
    setActiveTestId(next?.id ?? null);
    if (next) {
      requestAnimationFrame(() => {
        document.getElementById(`test-row-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  return (
    <div>
      <Link
        to={`/projects/${run.projectId}/runs`}
        className="no-print mb-4 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← Back to runs
      </Link>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{run.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{run.suite?.name}</p>
          {editingDates ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateDates.mutate();
              }}
              className="mt-1 flex flex-wrap items-end gap-2"
            >
              <Field>
                <Label htmlFor="run-start">Start date</Label>
                <Input id="run-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field>
                <Label htmlFor="run-end">End date</Label>
                <Input id="run-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
              <Button type="submit" disabled={updateDates.isPending} className="mb-3">
                Save
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditingDates(false)} className="mb-3">
                Cancel
              </Button>
            </form>
          ) : (
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <span>
                {run.startDate || run.endDate ? (
                  <>
                    {run.startDate && `Starts ${new Date(run.startDate).toLocaleDateString()}`}
                    {run.startDate && run.endDate && ' · '}
                    {run.endDate && `Ends ${new Date(run.endDate).toLocaleDateString()}`}
                  </>
                ) : run.plan?.endDate || run.milestone?.dueDate ? (
                  <>Inherits {run.plan?.endDate ? 'plan end date' : 'milestone due date'}: {new Date((run.plan?.endDate || run.milestone?.dueDate)!).toLocaleDateString()}</>
                ) : (
                  'No dates set'
                )}
              </span>
              {canManage && !run.isCompleted && (
                <button
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                  onClick={() => {
                    setStartDate(run.startDate ? run.startDate.slice(0, 10) : '');
                    setEndDate(run.endDate ? run.endDate.slice(0, 10) : '');
                    setEditingDates(true);
                  }}
                >
                  Edit dates
                </button>
              )}
            </div>
          )}
          {run.endDate &&
            (run.plan?.endDate || run.milestone?.dueDate) &&
            new Date(run.endDate) > new Date((run.plan?.endDate || run.milestone?.dueDate)!) && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                This run's end date is after its {run.plan?.endDate ? 'plan' : 'milestone'}'s{' '}
                {run.plan?.endDate ? 'end date' : 'due date'} (
                {new Date((run.plan?.endDate || run.milestone?.dueDate)!).toLocaleDateString()}).
              </p>
            )}
        </div>
        <div className="no-print flex items-center gap-2">
          <PrintButton />
          <button
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => defectsApi.downloadDefectsCsv(run.id, run.name)}
          >
            Export defects CSV
          </button>
          {canManage && (
            <Button variant="secondary" onClick={() => setShowRerun(true)}>
              Rerun
            </Button>
          )}
          {canManage && !run.isCompleted && (
            <Button variant="secondary" onClick={() => closeRun.mutate()} disabled={closeRun.isPending}>
              Close run
            </Button>
          )}
          {canManage && run.isCompleted && (
            <Button variant="secondary" onClick={() => reopenRun.mutate()} disabled={reopenRun.isPending}>
              Reopen run
            </Button>
          )}
          {!canManage && run.isCompleted && <span className="text-sm text-slate-500 dark:text-slate-400">Closed</span>}
        </div>
      </div>

      <RerunDialog
        open={showRerun}
        onClose={() => setShowRerun(false)}
        onSubmit={(input) => rerun.mutate(input)}
        submitting={rerun.isPending}
        showNameField
        defaultName={`${run.name} (Rerun)`}
      />

      {summaryQuery.data && <SummaryBar summary={summaryQuery.data} />}

      {canBulkAssign && allTests.length > 0 && (
        <FilterByUser
          directory={directoryQuery.data?.users ?? []}
          currentUserId={user?.id}
          appliedFilter={appliedFilter}
          onApply={(filter) => {
            setAppliedFilter(filter);
            setSelectedIds(new Set());
          }}
          onClear={() => {
            setAppliedFilter(null);
            setSelectedIds(new Set());
          }}
        />
      )}

      {appliedFilter && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
          <span>
            Showing {visibleTests.length} of {allTests.length} tests matching filter
          </span>
          {visibleTests.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span>Assign all in filter to:</span>
              <Select value={filterAssigneeId} onChange={(e) => setFilterAssigneeId(e.target.value)} className="w-40 py-1 text-xs">
                <option value="">Unassigned</option>
                {(directoryQuery.data?.users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === user?.id ? `${u.name} (me)` : u.name}
                  </option>
                ))}
              </Select>
              <Button
                onClick={() => bulkAssign.mutate({ testIds: visibleTests.map((t) => t.id), assignedToId: filterAssigneeId || null })}
                disabled={bulkAssign.isPending}
              >
                Assign all in filter
              </Button>
            </div>
          )}
        </div>
      )}

      {canBulkAssign && visibleTests.length > 0 && (
        <div className="no-print mb-2 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={visibleTests.length > 0 && selectedIds.size === visibleTests.length}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
            />
            Select all
          </label>

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{selectedIds.size} selected</span>
              <Select value={bulkAssigneeId} onChange={(e) => setBulkAssigneeId(e.target.value)} className="w-40 py-1 text-xs">
                <option value="">Unassigned</option>
                {(directoryQuery.data?.users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === user?.id ? `${u.name} (me)` : u.name}
                  </option>
                ))}
              </Select>
              <Button
                onClick={() => bulkAssign.mutate({ testIds: [...selectedIds], assignedToId: bulkAssigneeId || null })}
                disabled={bulkAssign.isPending}
              >
                Assign selected
              </Button>
              <span className="text-xs text-slate-400 dark:text-slate-500">Set status:</span>
              {(['PASSED', 'FAILED', 'BLOCKED', 'RETEST'] as ResultStatus[]).map((status) => (
                <button
                  key={status}
                  disabled={bulkResult.isPending}
                  onClick={() => bulkResult.mutate({ testIds: [...selectedIds], status })}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${STATUS_BUTTON_CLASSES[status]}`}
                >
                  {status}
                </button>
              ))}
              <button className="text-xs text-slate-500 dark:text-slate-400 hover:underline" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        {visibleTests.map((test) => (
          <TestRow
            key={test.id}
            test={test}
            run={run}
            canSubmit={canSubmit && !run.isCompleted}
            canAssign={canSubmit && !run.isCompleted}
            directory={directoryQuery.data?.users ?? []}
            currentUserId={user?.id}
            currentUserName={user?.name}
            knownDefectIds={knownDefectIds}
            selected={selectedIds.has(test.id)}
            onToggleSelect={() => toggleSelect(test.id)}
            expanded={activeTestId === test.id}
            onToggleExpand={() => setActiveTestId(activeTestId === test.id ? null : test.id)}
            onAdvance={() => advanceToNext(test.id)}
          />
        ))}
        {visibleTests.length === 0 && (
          <p className="p-3 text-sm text-slate-500 dark:text-slate-400">{appliedFilter ? 'No tests match this filter.' : 'No tests in this run.'}</p>
        )}
      </div>
    </div>
  );
}
