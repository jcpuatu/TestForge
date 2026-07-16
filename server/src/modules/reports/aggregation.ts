// Shared aggregation helpers for the report family (Phases H-K) — hand-rolled JS grouping
// over Prisma findMany results, matching this project's existing convention (no charting or
// stats library dependency; see reports/routes.ts's dashboardRouter for the precedent).

export interface DistributionBucket {
  value: string;
  count: number;
  percent: number;
}

// Groups rows by a field value, returned sorted by count descending. `getField` returning ''
// or 'None' both bucket under that literal string — callers decide the "empty" label.
export function groupByField<T>(rows: T[], getField: (row: T) => string): DistributionBucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = getField(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const total = rows.length;
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, percent: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

// TestRail's References/Defects fields are both comma-separated free text — same split rule
// reused here for TestCase.referenceLink (Coverage for References, Cases) and in Phase I for
// Summary for References (Defects), matching the existing Result.defects comma-split
// convention in reports/routes.ts's defectsRouter.
export function parseReferences(value: string | null | undefined): string[] {
  if (!value) return [];
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Exact-duplicate dedup (e.g. a copy/paste slip typing "BUG-100, BUG-100") — safe for every
  // caller of this shared parser, not just defect aggregation: nobody wants a case's own
  // reference list or a result's defect list double-counting a literal repeat. Order-preserving
  // (first occurrence kept) rather than a Set round-trip, so callers that care about original
  // ordering aren't affected.
  return parts.filter((s, i) => parts.indexOf(s) === i);
}

export type ActivityPeriod = 'day' | 'month';

export interface ActivityBucket {
  period: string; // 'YYYY-MM-DD' for day, 'YYYY-MM' for month
  count: number;
}

function periodKey(date: Date, period: ActivityPeriod): string {
  const iso = date.toISOString();
  return period === 'day' ? iso.slice(0, 10) : iso.slice(0, 7);
}

// Buckets rows into day/month periods, sorted chronologically. Every period between the first
// and last observed bucket is NOT backfilled with zeros here — callers with a known date range
// (e.g. Activity Summary) should backfill zero-buckets themselves so "no activity that day"
// still renders as a visible gap rather than a missing bar.
export function bucketByPeriod<T>(rows: T[], getDate: (row: T) => Date, period: ActivityPeriod): ActivityBucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = periodKey(getDate(row), period);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([p, count]) => ({ period: p, count })).sort((a, b) => (a.period < b.period ? -1 : 1));
}

// Fills in zero-count buckets for every day/month between from/to (inclusive) that
// `bucketByPeriod` didn't observe, so activity charts show real gaps instead of skipping days.
export function fillPeriodGaps(buckets: ActivityBucket[], from: Date, to: Date, period: ActivityPeriod): ActivityBucket[] {
  const byPeriod = new Map(buckets.map((b) => [b.period, b.count]));
  const filled: ActivityBucket[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = periodKey(cursor, period);
    if (!filled.some((b) => b.period === key)) filled.push({ period: key, count: byPeriod.get(key) ?? 0 });
    if (period === 'day') {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } else {
      // Date.setUTCMonth doesn't clamp an out-of-range day-of-month on overflow — e.g.
      // 2026-01-31 + 1 month lands on 2026-03-03 (February only has 28 days), silently
      // skipping February's key entirely on every later iteration too, which meant real
      // activity data for a skipped month was dropped from the report outright, not just
      // missing its zero-placeholder. periodKey() only reads the YYYY-MM portion for month
      // buckets (see above), so pinning the day to 1 before advancing is always safe here and
      // keeps every later month-increment exact.
      cursor.setUTCDate(1);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return filled;
}

export type DateRangePreset = 'today' | 'yesterday' | 'lastWeek' | 'thisWeek' | 'lastMonth' | 'thisMonth' | 'custom';

// All date-range math below operates in UTC consistently (Date.UTC / getUTCDate / setUTCDate),
// matching periodKey()'s use of toISOString() above and this codebase's existing convention of
// treating date-range filters as UTC calendar days (see CaseFilterBar's T00:00:00.000Z/
// T23:59:59.999Z suffix convention). Mixing local-time construction with UTC serialization was
// tried first and produced an off-by-one-day bug on any server not running in UTC — don't
// reintroduce local-time Date getters/setters here.
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
function endOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

// Matches TestRail's own documented Activity date-range presets exactly, including "week"
// meaning Sunday-through-Saturday. `now` is passed in (not read internally) so callers/tests
// can pin it rather than depending on wall-clock time.
export function resolveDateRangePreset(
  preset: DateRangePreset,
  now: Date,
  customFrom?: string,
  customTo?: string,
): { from: Date; to: Date } {
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setUTCDate(y.getUTCDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'thisWeek': {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - start.getUTCDay());
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return { from: startOfDay(start), to: endOfDay(end) };
    }
    case 'lastWeek': {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - start.getUTCDay() - 7);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return { from: startOfDay(start), to: endOfDay(end) };
    }
    case 'thisMonth': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      return { from: startOfDay(start), to: endOfDay(end) };
    }
    case 'lastMonth': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      return { from: startOfDay(start), to: endOfDay(end) };
    }
    case 'custom':
    default:
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : startOfDay(now),
        to: customTo ? endOfDay(new Date(customTo)) : endOfDay(now),
      };
  }
}

export function splitCsvParam(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value.split(',').filter(Boolean);
}
