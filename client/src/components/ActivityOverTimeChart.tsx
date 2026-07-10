export interface ActivitySeriesKey {
  key: string;
  label: string;
  color: string; // Tailwind bg-* class
}

// Day/month-bucketed bar row — the hand-rolled stand-in for TestRail's Activity (results over
// time) line chart. Reused across Phase H's Activity Summary and Phase J's Summary reports,
// parameterized by which numeric fields in each data point to render as side-by-side bars.
export function ActivityOverTimeChart({
  data,
  seriesKeys,
  height = 80,
}: {
  data: Array<Record<string, number | string>>;
  seriesKeys: ActivitySeriesKey[];
  height?: number;
}) {
  if (data.length === 0) return <p className="text-xs text-slate-400 dark:text-slate-500">No activity in this range.</p>;
  const max = Math.max(1, ...data.flatMap((d) => seriesKeys.map((s) => Number(d[s.key]) || 0)));

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((d, i) => (
          // Explicit height:100% is required here, not just inherited from the parent's
          // items-end flex alignment — items-end gives this column auto (shrink-to-fit)
          // height, which makes the bar children's percentage heights below resolve against
          // an indeterminate height and collapse to ~0. Confirmed via browser screenshot
          // (bars rendered as flat 2px lines) before this fix.
          <div
            key={`${d.period}-${i}`}
            className="flex flex-1 items-end gap-px"
            style={{ height: '100%' }}
            title={String(d.period)}
          >
            {seriesKeys.map((s) => {
              const value = Number(d[s.key]) || 0;
              return (
                <div
                  key={s.key}
                  className={`flex-1 rounded-t ${s.color}`}
                  style={{ height: `${(value / max) * 100}%`, minHeight: value > 0 ? 2 : 0 }}
                  title={`${String(d.period)} · ${s.label}: ${value}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>{String(data[0]?.period ?? '')}</span>
        {data.length > 1 && <span>{String(data[data.length - 1]?.period ?? '')}</span>}
      </div>
      {seriesKeys.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {seriesKeys.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-sm ${s.color}`} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
