import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Bug } from 'lucide-react';
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
import { DraftDefectPanel } from './DraftDefectPanel';

const STATUS_OPTIONS: ResultStatus[] = ['PASSED', 'FAILED', 'BLOCKED', 'RETEST'];
const STATUS_BUTTON_CLASSES: Record<ResultStatus, string> = {
  UNTESTED: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  PASSED: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200',
  FAILED: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200',
  BLOCKED: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200',
  RETEST: 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-200',
};

function SummaryBar({ summary }: { summary: runsApi.RunSummary }) {
  if (summary.total === 0) return null;
  return (
    <div className="mb-4">
      <StackedStatusBar counts={summary.counts} total={summary.total} height={10} />
      <div className="mt-1.5 flex items-center gap-4">
        <StatusLegend counts={summary.counts} />
        <span className="text-xs text-slate-400">Total: {summary.total}</span>
      </div>
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
}: {
  test: runsApi.RunCase;
  run: TestRun;
  canSubmit: boolean;
  canAssign: boolean;
  directory: DirectoryUser[];
  currentUserId: string | undefined;
  currentUserName: string | undefined;
  knownDefectIds: string[];
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState('');
  const [defects, setDefects] = useState('');
  const [showDraft, setShowDraft] = useState(false);

  const resultsQuery = useQuery({
    queryKey: ['tests', test.id, 'results'],
    queryFn: () => runsApi.listResults(test.id),
    enabled: expanded,
  });

  const submitResult = useMutation({
    mutationFn: (status: ResultStatus) => runsApi.submitResult(test.id, { status, comment: comment || undefined, defects: defects || undefined }),
    onSuccess: () => {
      setComment('');
      setDefects('');
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['tests', test.id, 'results'] });
    },
  });

  const reassign = useMutation({
    mutationFn: (assignedToId: string | null) => runsApi.reassignTest(test.id, assignedToId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', test.runId, 'tests'] }),
  });

  const hasOpenDefect = (test.status === 'FAILED' || test.status === 'BLOCKED') && !!test.latestDefects;

  return (
    <div className="border-b border-slate-200 p-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setExpanded((v) => !v)}>
          <PriorityBadge priority={test.priority} />
          <span className="text-sm font-medium text-slate-800">{test.titleSnapshot}</span>
          {hasOpenDefect && <Bug className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Has linked defect" />}
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
            <span className="text-xs text-slate-400">{test.assignedTo?.name ?? 'Unassigned'}</span>
          )}
          <StatusBadge status={test.status} />
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          {test.stepsSnapshot && test.stepsSnapshot.length > 0 && (
            <ol className="ml-5 list-decimal text-sm text-slate-600">
              {test.stepsSnapshot.map((step, i) => (
                <li key={i}>
                  {step.step}
                  {step.expected && <span className="text-slate-400"> → {step.expected}</span>}
                </li>
              ))}
            </ol>
          )}

          {canSubmit && (
            <div className="rounded-md bg-slate-50 p-3">
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
              <div className="flex flex-wrap items-center gap-2">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    disabled={submitResult.isPending}
                    onClick={() => submitResult.mutate(status)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${STATUS_BUTTON_CLASSES[status]}`}
                  >
                    {status}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowDraft((v) => !v)}
                  className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:underline"
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
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">History</h4>
              <div className="space-y-1.5">
                {resultsQuery.data.results.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 text-xs text-slate-600">
                    <StatusBadge status={r.status} />
                    <div>
                      <p>
                        {r.comment} {r.defects && <DefectText value={r.defects} />}
                      </p>
                      <p className="text-slate-400">
                        {r.enteredBy?.name} · {new Date(r.createdAt).toLocaleString()}
                      </p>
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
  const canSubmit = user?.role === 'ADMIN' || user?.role === 'LEAD' || user?.role === 'TESTER';
  const canManage = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const queryClient = useQueryClient();

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

  if (!runQuery.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const run = runQuery.data.run;
  const knownDefectIds = defectsQuery.data?.defects.map((d) => d.id) ?? [];

  return (
    <div>
      <Link to={`/projects/${run.projectId}/runs`} className="mb-4 inline-block text-sm text-blue-600 hover:underline">
        ← Back to runs
      </Link>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{run.name}</h1>
          <p className="text-sm text-slate-500">{run.suite?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-sm text-blue-600 hover:underline"
            onClick={() => defectsApi.downloadDefectsCsv(run.id, run.name)}
          >
            Export defects CSV
          </button>
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
          {!canManage && run.isCompleted && <span className="text-sm text-slate-500">Closed</span>}
        </div>
      </div>

      {summaryQuery.data && <SummaryBar summary={summaryQuery.data} />}

      <div className="rounded-lg border border-slate-200 bg-white">
        {testsQuery.data?.tests.map((test) => (
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
          />
        ))}
        {testsQuery.data?.tests.length === 0 && <p className="p-3 text-sm text-slate-500">No tests in this run.</p>}
      </div>
    </div>
  );
}
