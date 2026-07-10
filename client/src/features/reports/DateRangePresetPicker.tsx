import { Select } from '../../components/Input';
import type { DateRangePreset } from '../../api/casesReports';

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'lastWeek', label: 'Last Week' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];

// Matches TestRail's own Activity date-range presets exactly (server/aggregation.ts's
// resolveDateRangePreset implements the same set) — reused wherever a report offers this
// range picker (Phase H's Activity Summary, Phase J's Summary reports).
export function DateRangePresetPicker({
  preset,
  from,
  to,
  onChange,
}: {
  preset: DateRangePreset;
  from?: string;
  to?: string;
  onChange: (next: { preset: DateRangePreset; from?: string; to?: string }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-40 shrink-0">
        <Select
          aria-label="Date range"
          value={preset}
          onChange={(e) => onChange({ preset: e.target.value as DateRangePreset, from, to })}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      {preset === 'custom' && (
        <>
          <input
            type="date"
            aria-label="From date"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={from?.slice(0, 10) ?? ''}
            onChange={(e) => onChange({ preset, from: e.target.value || undefined, to })}
          />
          <span className="text-sm text-slate-400 dark:text-slate-500">to</span>
          <input
            type="date"
            aria-label="To date"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={to?.slice(0, 10) ?? ''}
            onChange={(e) => onChange({ preset, from, to: e.target.value || undefined })}
          />
        </>
      )}
    </div>
  );
}
