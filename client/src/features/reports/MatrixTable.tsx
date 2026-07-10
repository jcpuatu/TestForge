import { StatusBadge } from '../../components/Badge';
import type { ResultStatus } from '../../api/runs';

interface MatrixRowData {
  caseId: string;
  title: string;
  cells: { runId: string; status: string | null; defects?: string[] }[];
}

// Shared cases x runs grid, reused by Defects: Summary for Cases/References and Results:
// Comparison for Cases/References — one row per case, one column per selected run, cell =
// that case's status (+ defect IDs, when the report cares about them) in that run.
export function MatrixTable({
  runs,
  rows,
  showDefects,
}: {
  runs: { id: string; name: string }[];
  rows: MatrixRowData[];
  showDefects?: boolean;
}) {
  if (rows.length === 0) return <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No test cases found.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
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
              <td className="p-2.5 text-slate-700 dark:text-slate-300">{row.title}</td>
              {runs.map((r) => {
                const cell = row.cells.find((c) => c.runId === r.id);
                return (
                  <td key={r.id} className="p-2.5 text-center">
                    {cell?.status ? (
                      <StatusBadge status={cell.status as ResultStatus} />
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
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
  );
}
