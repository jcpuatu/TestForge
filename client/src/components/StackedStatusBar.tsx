import type { ResultStatus } from '../api/runs';

const SEGMENTS: { status: ResultStatus; color: string }[] = [
  { status: 'PASSED', color: 'bg-emerald-500' },
  { status: 'FAILED', color: 'bg-red-500' },
  { status: 'BLOCKED', color: 'bg-orange-500' },
  { status: 'RETEST', color: 'bg-cyan-500' },
  { status: 'UNTESTED', color: 'bg-slate-300' },
];

export const STATUS_LEGEND = SEGMENTS;

export function StackedStatusBar({ counts, total, height = 10 }: { counts: Record<ResultStatus, number>; total: number; height?: number }) {
  if (total === 0) {
    return <div className="rounded-full bg-slate-100" style={{ height }} />;
  }
  const visible = SEGMENTS.filter((seg) => counts[seg.status] > 0);
  return (
    <div className="flex overflow-hidden rounded-full bg-slate-100" style={{ height }}>
      {visible.map((seg, i) => (
        <div
          key={seg.status}
          className={seg.color}
          style={{
            width: `${(counts[seg.status] / total) * 100}%`,
            marginRight: i < visible.length - 1 ? 2 : 0,
          }}
          title={`${seg.status}: ${counts[seg.status]}`}
        />
      ))}
    </div>
  );
}

export function StatusLegend({ counts }: { counts: Record<ResultStatus, number> }) {
  const present = SEGMENTS.filter((seg) => counts[seg.status] > 0);
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {present.map((seg) => (
        <span key={seg.status} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${seg.color}`} />
          {seg.status}: {counts[seg.status]}
        </span>
      ))}
    </div>
  );
}
