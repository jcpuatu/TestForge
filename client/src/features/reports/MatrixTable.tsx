import { PriorityBadge, StatusBadge } from '../../components/Badge';
import { DownloadCsvButton } from '../../components/DownloadCsvButton';
import { downloadTableAsCsv } from '../../lib/downloadCsv';
import type { ResultStatus } from '../../api/runs';
import type { Priority } from '../../api/types';

interface MatrixRowData {
  caseId: string;
  title: string;
  // Real snapshot data (RunCase.priority), already fetched and sent by every caller of this
  // component (resultsReports.ts's ComparisonCase) but never actually rendered here — a
  // report-design audit flagged this as dead payload; wiring it up answers a natural question
  // ("are these failures all CRITICAL?") the data already supports.
  priority?: Priority;
  cells: { runId: string; status: string | null; defects?: string[] }[];
}

// Shared cases x runs grid, reused by Defects: Summary for Cases/References and Results:
// Comparison for Cases/References — one row per case, one column per selected run, cell =
// that case's status (+ defect IDs, when the report cares about them) in that run.
// `csvFilename` is opt-in — pass it to show a Download CSV button for this exact table.
export function MatrixTable({
  runs,
  rows,
  showDefects,
  csvFilename,
}: {
  runs: { id: string; name: string }[];
  rows: MatrixRowData[];
  showDefects?: boolean;
  csvFilename?: string;
}) {
  if (rows.length === 0) return <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No test cases found.</p>;

  function handleDownload() {
    if (!csvFilename) return;
    const headers = ['Case', ...runs.map((r) => r.name)];
    const rowsOut = rows.map((row) => [
      row.title,
      ...runs.map((r) => {
        const cell = row.cells.find((c) => c.runId === r.id);
        if (!cell?.status) return '';
        return showDefects && cell.defects?.length ? `${cell.status} (${cell.defects.join(', ')})` : cell.status;
      }),
    ]);
    downloadTableAsCsv(headers, rowsOut, csvFilename);
  }

  return (
    <div>
      {csvFilename && (
        <div className="mb-2 flex justify-end">
          <DownloadCsvButton onClick={handleDownload} />
        </div>
      )}
      <div className="print-card overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 dark:text-slate-400">
              <th className="p-2.5 font-medium">Case</th>
              {runs.map((r) => (
                <th key={r.id} className="p-2.5 text-center font-medium">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map((row) => (
              <tr key={row.caseId}>
                <td className="p-2.5 text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    {row.priority && <PriorityBadge priority={row.priority} />}
                    {row.title}
                  </div>
                </td>
                {runs.map((r) => {
                  const cell = row.cells.find((c) => c.runId === r.id);
                  return (
                    <td key={r.id} className="p-2.5 text-center">
                      {cell?.status ? (
                        <StatusBadge status={cell.status as ResultStatus} />
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600" title="Not included in this run">
                          —
                        </span>
                      )}
                      {showDefects && cell?.defects && cell.defects.length > 0 && (
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{cell.defects.join(', ')}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* A blank dash and an UNTESTED badge both read as "muted grey" at a glance, with no
          on-screen legend explaining the difference (a genuinely different situation: not part
          of this run at all, vs. part of the run and simply not yet executed). */}
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">— means the case wasn't included in that run at all.</p>
    </div>
  );
}
