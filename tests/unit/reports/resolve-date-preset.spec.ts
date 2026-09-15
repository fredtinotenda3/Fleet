// tests/unit/reports/resolve-date-preset.spec.ts
//
// WAVE 3, R.3.1 -- Fleet Summary date-range wiring.
//
// Pins frontend/modules/reports/utils/resolveDatePreset.ts, the resolver
// that turns an ExecutiveDashboardFilter.datePreset into a concrete
// { startDate, endDate } now actually passed to useFleetKPIs(dateRange).
// Before this delivery the preset union existed but nothing resolved it,
// so every boundary below is a genuine new behaviour, not a refactor of
// existing logic -- there is no prior implementation to regress against.
//
// `now` is fixed throughout so every assertion is deterministic regardless
// of when the suite runs.

import { resolveDateRange, resolveFilterDateRange } from '@/frontend/modules/reports/utils/resolveDatePreset';
import { defaultExecutiveDashboardFilter } from '@/frontend/modules/reports/schemas/executiveDashboard';

// Tuesday, September 15, 2026, 14:30:00 local -- mid-day, mid-week, mid-month,
// mid-quarter (Q3 = Jul-Sep) so every preset's boundary math is exercised
// without landing on an edge case by accident.
const NOW = new Date(2026, 8, 15, 14, 30, 0, 0);

const DAY_MS = 24 * 60 * 60 * 1000;

function expectFullDay(d: Date, year: number, month: number, date: number) {
  expect(d.getFullYear()).toBe(year);
  expect(d.getMonth()).toBe(month);
  expect(d.getDate()).toBe(date);
}

describe('resolveDateRange: day-count presets resolve to real, correctly-sized windows', () => {
  it('today: a single day, 00:00:00.000 to 23:59:59.999', () => {
    const range = resolveDateRange('today', undefined, NOW)!;
    expectFullDay(range.startDate, 2026, 8, 15);
    expect(range.startDate.getHours()).toBe(0);
    expect(range.startDate.getMinutes()).toBe(0);
    expect(range.startDate.getMilliseconds()).toBe(0);
    expectFullDay(range.endDate, 2026, 8, 15);
    expect(range.endDate.getHours()).toBe(23);
    expect(range.endDate.getMilliseconds()).toBe(999);
  });

  it('yesterday: the previous calendar day, not "24 hours ago"', () => {
    const range = resolveDateRange('yesterday', undefined, NOW)!;
    expectFullDay(range.startDate, 2026, 8, 14);
    expect(range.startDate.getHours()).toBe(0);
    expectFullDay(range.endDate, 2026, 8, 14);
    expect(range.endDate.getHours()).toBe(23);
  });

  it('last7Days: exactly a 7-day window ending today (not 6, not 8)', () => {
    const range = resolveDateRange('last7Days', undefined, NOW)!;
    expectFullDay(range.endDate, 2026, 8, 15);
    // 7 full days: day-1 00:00:00.000 through day-7 23:59:59.999 is
    // 7 * 86400000 - 1 ms wide.
    expect(range.endDate.getTime() - range.startDate.getTime()).toBe(7 * DAY_MS - 1);
    expectFullDay(range.startDate, 2026, 8, 9); // Sep 9 through Sep 15 inclusive = 7 days
  });

  it('last30Days: exactly a 30-day window ending today, crossing the month boundary correctly', () => {
    const range = resolveDateRange('last30Days', undefined, NOW)!;
    expectFullDay(range.endDate, 2026, 8, 15);
    expect(range.endDate.getTime() - range.startDate.getTime()).toBe(30 * DAY_MS - 1);
    expectFullDay(range.startDate, 2026, 7, 17); // Aug 17 through Sep 15 inclusive = 30 days
  });
});

describe('resolveDateRange: calendar presets align to real calendar boundaries', () => {
  it('thisMonth: month-to-date, not the full month (never queries into the future)', () => {
    const range = resolveDateRange('thisMonth', undefined, NOW)!;
    expectFullDay(range.startDate, 2026, 8, 1);
    expect(range.startDate.getHours()).toBe(0);
    expectFullDay(range.endDate, 2026, 8, 15); // "now", not Sep 30
  });

  it('lastMonth: the full previous calendar month, start to end', () => {
    const range = resolveDateRange('lastMonth', undefined, NOW)!;
    expectFullDay(range.startDate, 2026, 7, 1);
    expectFullDay(range.endDate, 2026, 7, 31); // August has 31 days
    expect(range.endDate.getHours()).toBe(23);
  });

  it('lastMonth: handles a January "now" by rolling back into the previous December/year', () => {
    const january = new Date(2026, 0, 10);
    const range = resolveDateRange('lastMonth', undefined, january)!;
    expectFullDay(range.startDate, 2025, 11, 1);
    expectFullDay(range.endDate, 2025, 11, 31);
  });

  it('thisQuarter: quarter-to-date (Q3 = Jul-Sep; "now" is Sep 15)', () => {
    const range = resolveDateRange('thisQuarter', undefined, NOW)!;
    expectFullDay(range.startDate, 2026, 6, 1); // July 1
    expectFullDay(range.endDate, 2026, 8, 15); // "now", not Sep 30
  });

  it('lastQuarter: the full previous quarter (Q2 = Apr-Jun)', () => {
    const range = resolveDateRange('lastQuarter', undefined, NOW)!;
    expectFullDay(range.startDate, 2026, 3, 1); // April 1
    expectFullDay(range.endDate, 2026, 5, 30); // June 30
  });

  it('lastQuarter: rolls back across the year boundary from Q1', () => {
    const q1 = new Date(2026, 1, 10); // February -> Q1
    const range = resolveDateRange('lastQuarter', undefined, q1)!;
    expectFullDay(range.startDate, 2025, 9, 1); // Oct 1, 2025
    expectFullDay(range.endDate, 2025, 11, 31); // Dec 31, 2025
  });

  it('thisYear: year-to-date', () => {
    const range = resolveDateRange('thisYear', undefined, NOW)!;
    expectFullDay(range.startDate, 2026, 0, 1);
    expectFullDay(range.endDate, 2026, 8, 15);
  });

  it('lastYear: the full previous calendar year', () => {
    const range = resolveDateRange('lastYear', undefined, NOW)!;
    expectFullDay(range.startDate, 2025, 0, 1);
    expectFullDay(range.endDate, 2025, 11, 31);
  });
});

describe('resolveDateRange: custom', () => {
  it('uses the given bounds directly', () => {
    const range = resolveDateRange(
      'custom',
      { dateFrom: '2026-01-05T00:00:00.000Z', dateTo: '2026-01-10T00:00:00.000Z' },
      NOW
    )!;
    expect(range.startDate.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(range.endDate.toISOString()).toBe('2026-01-10T00:00:00.000Z');
  });

  it('returns undefined when either bound is missing -- defensive fallback behind the schema refinement', () => {
    expect(resolveDateRange('custom', { dateFrom: '2026-01-05T00:00:00.000Z' }, NOW)).toBeUndefined();
    expect(resolveDateRange('custom', undefined, NOW)).toBeUndefined();
  });

  it('returns undefined for an unparseable custom bound rather than throwing or returning Invalid Date', () => {
    const range = resolveDateRange('custom', { dateFrom: 'not-a-date', dateTo: '2026-01-10T00:00:00.000Z' }, NOW);
    expect(range).toBeUndefined();
  });
});

describe('resolveFilterDateRange: wraps the ExecutiveDashboardFilter shape the page actually holds', () => {
  it('resolves the default filter (last30Days) to a real range', () => {
    const range = resolveFilterDateRange(defaultExecutiveDashboardFilter);
    expect(range).toBeDefined();
    expect(range!.startDate.getTime()).toBeLessThan(range!.endDate.getTime());
  });

  it('threads dateFrom/dateTo through for a custom filter', () => {
    const range = resolveFilterDateRange({
      ...defaultExecutiveDashboardFilter,
      datePreset: 'custom',
      dateFrom: '2026-02-01T00:00:00.000Z',
      dateTo: '2026-02-28T00:00:00.000Z',
    });
    expect(range!.startDate.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(range!.endDate.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});
