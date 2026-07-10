import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as caseHistoryApi from '../../api/caseHistory';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/Badge';
import { DefectText } from '../../components/DefectText';

// "Line chart of result outcomes over time" is rendered as a horizontal timeline of status
// dots (oldest → newest) rather than a literal line chart — reuses the same status-color
// language as StatusBadge/StackedStatusBar elsewhere instead of introducing a new chart type
// for a single trend indicator.
export function CaseHistoryModal({ caseId, caseTitle, onClose }: { caseId: string; caseTitle: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['cases', caseId, 'history'],
    queryFn: () => caseHistoryApi.getCaseHistory(caseId),
  });

  return (
    <Modal open onClose={onClose} title={`History: ${caseTitle}`} size="lg">
      {!data ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Outcomes over time
            </p>
            {data.timeline.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Never included in a run yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.timeline.map((t, i) => (
                  <span key={i} title={`${t.runName}: ${t.status}`}>
                    <StatusBadge status={t.status} />
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Runs ({data.timeline.length})
            </p>
            {/* Each run's defect (which can be a long pasted URL, not just a short "BUG-123"
                id) gets its own line below the run name/status, rather than sharing a
                justify-between row with them — that's what caused real overlap when a defect
                value was long. min-w-0 + truncate on both the name and the defect line means
                neither can force the row wider than the modal; the title attribute surfaces
                the untruncated value on hover. */}
            <div className="divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {[...data.timeline].reverse().map((t, i) => (
                <div key={i} className="flex items-start justify-between gap-3 p-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/runs/${t.runId}`}
                      className="block truncate text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      title={t.runName}
                    >
                      {t.runName}
                    </Link>
                    {t.defects && (
                      <div className="mt-0.5 truncate text-xs" title={t.defects}>
                        <DefectText value={t.defects} />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.isCompleted && <span className="text-xs text-slate-400 dark:text-slate-500">Closed</span>}
                    <StatusBadge status={t.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {data.defects.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Defects</p>
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {data.defects.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                    <div className="min-w-0 flex-1 truncate" title={d.id}>
                      <DefectText value={d.id} />
                    </div>
                    <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {d.count} reference{d.count === 1 ? '' : 's'} · {d.openCount > 0 ? `${d.openCount} still failing` : 'looks resolved'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
