import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as reportsApi from '../../../api/defectsResultsReports';
import { RunCheckboxList } from '../RunCheckboxList';
import { ReportShell } from '../ReportShell';
import { DefectText } from '../../../components/DefectText';
import { Badge } from '../../../components/Badge';
import { DownloadCsvButton } from '../../../components/DownloadCsvButton';
import { downloadTableAsCsv } from '../../../lib/downloadCsv';

export function DefectsSummaryReport({ projectId }: { projectId: string }) {
  const [runIds, setRunIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reportQuery = useQuery({
    queryKey: ['reports', 'defects', 'summary', projectId, runIds],
    queryFn: () => reportsApi.getDefectsSummary(projectId, { runIds }),
  });
  const data = reportQuery.data;

  return (
    <ReportShell
      title="Summary"
      description="Overview of defects discovered and linked to tests across a set of test runs. There's no real issue-tracker connection — this is inferred purely from whatever text testers have typed into the Defect IDs field."
      filters={
        <div className="w-full">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Test runs (none selected = 25 most recent)</p>
          <RunCheckboxList projectId={projectId} selected={runIds} onChange={setRunIds} />
        </div>
      }
    >
      {reportQuery.isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {data && (
        <>
          <div className="mb-2 flex justify-end">
            <DownloadCsvButton
              onClick={() =>
                downloadTableAsCsv(
                  ['Defect ID', 'Mentions', 'Open', 'Resolved', 'Last Seen'],
                  data.defects.map((d) => [
                    d.id,
                    d.count,
                    d.openCount,
                    d.resolvedCount,
                    new Date(d.lastSeenAt).toLocaleDateString(),
                  ]),
                  'defects-summary.csv',
                )
              }
            />
          </div>
          <div className="print-card divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          {data.defects.map((d) => (
            <div key={d.id} className="p-3">
              <button
                className="flex w-full items-center justify-between text-left"
                onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
              >
                <div className="flex items-center gap-2">
                  <DefectText value={d.id} />
                  {/* Three-way, not a binary openCount>0 check — a defect can be neither
                      "still failing" nor "resolved" if its latest result is RETEST/UNTESTED
                      (logged, but not yet re-verified). The old binary version collapsed that
                      pending state into "looks resolved," which is a materially different and
                      more dangerous claim than "nobody has checked this again yet." */}
                  {d.openCount > 0 ? (
                    <Badge className="bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400">{d.openCount} still failing</Badge>
                  ) : d.resolvedCount === d.count ? (
                    <Badge className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">looks resolved</Badge>
                  ) : (
                    <Badge className="bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">pending re-verification</Badge>
                  )}
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {/* "Mentions," not "references" — this app already has a distinct, established
                      meaning for "reference" (TestCase.referenceLink, e.g. a requirement/ticket
                      ID), used one report over in "Summary for References." Reusing the word
                      here for "how many tests mention this defect ID" was a real naming
                      collision. */}
                  {d.count} mention{d.count === 1 ? '' : 's'} · last seen {new Date(d.lastSeenAt).toLocaleDateString()}
                </span>
              </button>
              {expandedId === d.id && (
                <div className="mt-2 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2">
                  {d.cases.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>
                        {c.caseTitle} <span className="text-slate-400 dark:text-slate-500">— {c.runName}</span>
                      </span>
                      {/* Dropped when this report was adapted from the original project-wide
                          Defects tab (DefectsTab.tsx) — restoring feature parity. */}
                      <Link to={`/runs/${c.runId}`} className="no-print text-blue-600 dark:text-blue-400 hover:underline">
                        view run
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {data.defects.length === 0 && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No defects in the selected runs.</p>}
          </div>
        </>
      )}
    </ReportShell>
  );
}
