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
    <Modal open onClose={onClose} title={`History: ${caseTitle}`}>
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
            <div className="space-y-1.5">
              {[...data.timeline].reverse().map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <Link to={`/runs/${t.runId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                    {t.runName}
                  </Link>
                  <div className="flex items-center gap-2">
                    {t.defects && <DefectText value={t.defects} />}
                    <StatusBadge status={t.status} />
                    {t.isCompleted && <span className="text-xs text-slate-400 dark:text-slate-500">Closed</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {data.defects.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Defects</p>
              <div className="space-y-1.5">
                {data.defects.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm">
                    <DefectText value={d.id} />
                    <span className="text-xs text-slate-400 dark:text-slate-500">
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
