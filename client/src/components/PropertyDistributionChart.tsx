import { downloadTableAsCsv } from '../lib/downloadCsv';
import { DownloadCsvButton } from './DownloadCsvButton';

export interface DistributionBucket {
  value: string;
  count: number;
  percent: number;
}

// Horizontal bar-list — the hand-rolled stand-in for TestRail's Property Distribution bar
// chart, matching StackedStatusBar's existing div-based style (no charting library in this
// codebase, see client/CLAUDE.md). `csvFilename` is opt-in — pass it to show a Download CSV
// button for this chart's buckets; omit it for chart-only usage.
export function PropertyDistributionChart({ buckets, csvFilename }: { buckets: DistributionBucket[]; csvFilename?: string }) {
  if (buckets.length === 0) return <p className="text-xs text-slate-400 dark:text-slate-500">No data.</p>;
  const max = Math.max(...buckets.map((b) => b.count));

  return (
    <div>
      {csvFilename && (
        <div className="mb-2 flex justify-end">
          <DownloadCsvButton
            onClick={() =>
              downloadTableAsCsv(
                ['Value', 'Count', 'Percent'],
                buckets.map((b) => [b.value, b.count, `${Math.round(b.percent * 100)}%`]),
                csvFilename,
              )
            }
          />
        </div>
      )}
      <div className="space-y-1.5">
        {buckets.map((b) => (
          <div key={b.value} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-xs text-slate-600 dark:text-slate-300" title={b.value}>
              {b.value}
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-700">
              <div className="h-full bg-blue-500" style={{ width: `${max > 0 ? (b.count / max) * 100 : 0}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">
              {b.count} ({Math.round(b.percent * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
