import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import * as auditApi from '../../api/audit';

const ACTION_LABELS: Record<string, string> = {
  LABEL_RENAMED: 'Label renamed',
  LABEL_DELETED: 'Label deleted',
  SECTION_DELETED: 'Section deleted',
  SUITE_DELETED: 'Suite deleted',
  CASE_DELETED: 'Case deleted',
  CASE_PERMANENTLY_DELETED: 'Case permanently deleted',
  MILESTONE_DATES_CHANGED: 'Milestone dates changed',
  PLAN_DATES_CHANGED: 'Plan dates changed',
  RUN_DATES_CHANGED: 'Run dates changed',
  RUN_CLOSED: 'Run closed',
  RUN_REOPENED: 'Run reopened',
  RUN_DELETED: 'Run permanently deleted',
};

export function ActivityTab() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'audit-log'],
    queryFn: () => auditApi.listAuditLog(projectId!),
    enabled: !!projectId,
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">Activity</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        A chronological log of destructive and easily-second-guessed actions in this project — label/section/suite/case
        deletion, milestone/plan/run date changes, and run closures. Not a log of every change in the app.
      </p>

      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        {data?.entries.map((e) => (
          <div key={e.id} className="flex items-start justify-between gap-3 p-3 text-sm">
            <div>
              <span className="font-medium text-slate-800 dark:text-slate-200">{ACTION_LABELS[e.action] ?? e.action}</span>
              <p className="text-slate-500 dark:text-slate-400">{e.summary}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
              <p>{e.actor?.name ?? 'Unknown user'}</p>
              <p>{new Date(e.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ))}
        {data?.entries.length === 0 && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No activity logged yet.</p>}
      </div>
    </div>
  );
}
