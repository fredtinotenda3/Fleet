// frontend/modules/reports/utils/resolveDatePreset.ts
//
// WAVE 3, R.3.1 -- Fleet Summary date-range wiring.
//
// executiveDashboard.ts already defined a full DatePreset union (today,
// yesterday, last7Days, last30Days, thisMonth, lastMonth, thisQuarter,
// lastQuarter, thisYear, lastYear, custom) and ExecutiveDashboardFilter
// carried it in local component state -- but nothing ever turned a preset
// into a concrete { startDate, endDate } and nothing ever passed one to
// useFleetKPIs(). The filter bar's own state was dead: useExecutiveDashboard
// documents that its `filter` argument is accepted "for API-shape
// stability" only, and ExecutiveDashboard.tsx called useFleetKPIs() with no
// argument at all, so the KPI grid always ran unfiltered regardless of what
// a user selected -- because nothing let them select anything in the first
// place.
//
// This is the missing resolver. It is deliberately pure (no Date.now()
// captured implicitly -- callers pass `now` for testability) and matches
// the date-range contract fleet-analytics.service.ts already consumes
// (modules/shared/types/common.types#DateRange: half-open [startDate,
// endDate] consumed as an inclusive $gte/$lte bound by every *Stats
// aggregation -- see expense.repository.ts#getExpenseStats).

import type { DatePreset, ExecutiveDashboardFilter } from '../schemas/executiveDashboard';

export interface ResolvedDateRange {
  startDate: Date;
  endDate: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfQuarter(d: Date): Date {
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qStartMonth, 1, 0, 0, 0, 0);
}

function endOfQuarter(d: Date): Date {
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qStartMonth + 3, 0, 23, 59, 59, 999);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

/**
 * Resolves a DatePreset (+ custom bounds) to a concrete { startDate,
 * endDate } pair. Returns `undefined` only for a malformed 'custom' preset
 * missing one of its bounds -- executiveDashboardFilterSchema's own zod
 * refinement already prevents that shape from validating, so this is a
 * defensive fallback, not the primary guard.
 */
export function resolveDateRange(
  preset: DatePreset,
  custom?: { dateFrom?: string; dateTo?: string },
  now: Date = new Date()
): ResolvedDateRange | undefined {
  switch (preset) {
    case 'today':
      return { startDate: startOfDay(now), endDate: endOfDay(now) };

    case 'yesterday': {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { startDate: startOfDay(yesterday), endDate: endOfDay(yesterday) };
    }

    case 'last7Days': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return { startDate: startOfDay(start), endDate: endOfDay(now) };
    }

    case 'last30Days': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      return { startDate: startOfDay(start), endDate: endOfDay(now) };
    }

    case 'thisMonth':
      return { startDate: startOfMonth(now), endDate: endOfDay(now) };

    case 'lastMonth': {
      const lastMonthAnchor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { startDate: startOfMonth(lastMonthAnchor), endDate: endOfMonth(lastMonthAnchor) };
    }

    case 'thisQuarter':
      return { startDate: startOfQuarter(now), endDate: endOfDay(now) };

    case 'lastQuarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const lastQuarterAnchor = new Date(now.getFullYear(), qStartMonth - 3, 1);
      return { startDate: startOfQuarter(lastQuarterAnchor), endDate: endOfQuarter(lastQuarterAnchor) };
    }

    case 'thisYear':
      return { startDate: startOfYear(now), endDate: endOfDay(now) };

    case 'lastYear': {
      const lastYearAnchor = new Date(now.getFullYear() - 1, 0, 1);
      return { startDate: startOfYear(lastYearAnchor), endDate: endOfYear(lastYearAnchor) };
    }

    case 'custom': {
      if (!custom?.dateFrom || !custom?.dateTo) return undefined;
      const startDate = new Date(custom.dateFrom);
      const endDate = new Date(custom.dateTo);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;
      return { startDate, endDate };
    }

    default: {
      // Exhaustiveness guard -- if DATE_PRESETS ever grows, this must be
      // updated deliberately rather than silently falling through.
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

/** Convenience wrapper over the filter shape ExecutiveDashboard actually holds. */
export function resolveFilterDateRange(filter: ExecutiveDashboardFilter): ResolvedDateRange | undefined {
  return resolveDateRange(filter.datePreset, { dateFrom: filter.dateFrom, dateTo: filter.dateTo });
}
