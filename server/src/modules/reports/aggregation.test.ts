import { bucketByPeriod, fillPeriodGaps, groupByField, parseReferences, resolveDateRangePreset } from './aggregation';

describe('groupByField', () => {
  it('groups rows by field value with counts and percentages, sorted descending', () => {
    const rows = [{ p: 'HIGH' }, { p: 'HIGH' }, { p: 'LOW' }, { p: 'HIGH' }, { p: 'LOW' }];
    const buckets = groupByField(rows, (r) => r.p);
    expect(buckets).toEqual([
      { value: 'HIGH', count: 3, percent: 0.6 },
      { value: 'LOW', count: 2, percent: 0.4 },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(groupByField([], () => 'x')).toEqual([]);
  });
});

describe('parseReferences', () => {
  it('splits comma-separated references, trimming whitespace', () => {
    expect(parseReferences('TRM-1, TRM-42 ,TRM-7')).toEqual(['TRM-1', 'TRM-42', 'TRM-7']);
  });

  it('returns an empty array for null/undefined/empty input', () => {
    expect(parseReferences(null)).toEqual([]);
    expect(parseReferences(undefined)).toEqual([]);
    expect(parseReferences('')).toEqual([]);
  });

  it('filters out empty segments from trailing/double commas', () => {
    expect(parseReferences('TRM-1,,TRM-2,')).toEqual(['TRM-1', 'TRM-2']);
  });

  // Regression test: a copy/paste slip like "BUG-100, BUG-100" previously double-counted a
  // single mention as two in every report built on this shared parser (defect aggregation,
  // reference coverage). Order-preserving, first occurrence kept.
  it('dedupes exact-duplicate entries', () => {
    expect(parseReferences('BUG-100, BUG-100, BUG-101')).toEqual(['BUG-100', 'BUG-101']);
  });
});

describe('bucketByPeriod', () => {
  it('buckets rows by day, sorted chronologically', () => {
    const rows = [{ d: new Date('2026-07-02T10:00:00Z') }, { d: new Date('2026-07-01T09:00:00Z') }, { d: new Date('2026-07-01T15:00:00Z') }];
    expect(bucketByPeriod(rows, (r) => r.d, 'day')).toEqual([
      { period: '2026-07-01', count: 2 },
      { period: '2026-07-02', count: 1 },
    ]);
  });

  it('buckets rows by month', () => {
    const rows = [{ d: new Date('2026-07-02T10:00:00Z') }, { d: new Date('2026-06-15T09:00:00Z') }];
    expect(bucketByPeriod(rows, (r) => r.d, 'month')).toEqual([
      { period: '2026-06', count: 1 },
      { period: '2026-07', count: 1 },
    ]);
  });
});

describe('fillPeriodGaps', () => {
  it('fills zero-count days between from/to that had no activity', () => {
    const buckets = [{ period: '2026-07-01', count: 2 }];
    const filled = fillPeriodGaps(buckets, new Date('2026-07-01T00:00:00Z'), new Date('2026-07-03T00:00:00Z'), 'day');
    expect(filled).toEqual([
      { period: '2026-07-01', count: 2 },
      { period: '2026-07-02', count: 0 },
      { period: '2026-07-03', count: 0 },
    ]);
  });

  // Regression test: Date.setUTCMonth doesn't clamp an out-of-range day-of-month on overflow —
  // a cursor starting on the 31st previously skipped February outright (Jan 31 + 1 month lands
  // on Mar 3), not just missing its zero-placeholder but silently dropping any real activity
  // that period bucket would have carried. Only reachable via the "custom" date-range preset,
  // which is exactly what a user picking their own start date can trigger.
  it('does not skip a month when the cursor starts on the 29th-31st', () => {
    const buckets = [{ period: '2026-06', count: 5 }];
    const filled = fillPeriodGaps(buckets, new Date('2026-05-31T00:00:00Z'), new Date('2026-08-01T00:00:00Z'), 'month');
    expect(filled.map((b) => b.period)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08']);
    expect(filled.find((b) => b.period === '2026-06')?.count).toBe(5);
  });
});

describe('resolveDateRangePreset', () => {
  // Wednesday 2026-07-08 (UTC) — all assertions below read UTC fields since the implementation
  // is UTC-consistent throughout (see aggregation.ts's comment on why).
  const now = new Date('2026-07-08T12:00:00Z');

  it('resolves "today" to the start/end of the given day', () => {
    const { from, to } = resolveDateRangePreset('today', now);
    expect(from.toISOString().slice(0, 10)).toBe('2026-07-08');
    expect(to.toISOString().slice(0, 10)).toBe('2026-07-08');
  });

  it('resolves "yesterday" to the prior day', () => {
    const { from } = resolveDateRangePreset('yesterday', now);
    expect(from.getUTCDate()).toBe(7);
  });

  it('resolves "thisWeek" to Sunday-through-Saturday containing now', () => {
    const { from, to } = resolveDateRangePreset('thisWeek', now);
    expect(from.getUTCDay()).toBe(0); // Sunday
    expect(to.getUTCDay()).toBe(6); // Saturday
    expect(from.getUTCDate()).toBe(5); // Sunday 2026-07-05
    expect(to.getUTCDate()).toBe(11); // Saturday 2026-07-11
  });

  it('resolves "lastWeek" to the prior Sunday-through-Saturday', () => {
    const { from, to } = resolveDateRangePreset('lastWeek', now);
    expect(from.getUTCDate()).toBe(28); // Sunday 2026-06-28
    expect(to.getUTCMonth()).toBe(6); // July (0-indexed)
    expect(to.getUTCDate()).toBe(4); // Saturday 2026-07-04
  });

  it('resolves "thisMonth" to the 1st through the last day of the current month', () => {
    const { from, to } = resolveDateRangePreset('thisMonth', now);
    expect(from.getUTCDate()).toBe(1);
    expect(to.getUTCDate()).toBe(31); // July has 31 days
  });

  it('resolves "lastMonth" to the full prior calendar month', () => {
    const { from, to } = resolveDateRangePreset('lastMonth', now);
    expect(from.getUTCMonth()).toBe(5); // June
    expect(from.getUTCDate()).toBe(1);
    expect(to.getUTCMonth()).toBe(5);
    expect(to.getUTCDate()).toBe(30); // June has 30 days
  });

  it('resolves "custom" using the provided from/to strings', () => {
    const { from, to } = resolveDateRangePreset('custom', now, '2026-01-01', '2026-01-31');
    expect(from.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(to.toISOString().slice(0, 10)).toBe('2026-01-31');
  });
});
