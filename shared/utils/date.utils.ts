// shared/utils/date.utils.ts

import { format, formatDistance, differenceInDays, isValid, parseISO } from 'date-fns';

export const DATE_FORMATS = {
  DISPLAY: 'MMM dd, yyyy',
  DISPLAY_SHORT: 'MMM dd',
  DISPLAY_WITH_TIME: 'MMM dd, yyyy HH:mm',
  API: 'yyyy-MM-dd',
  API_FULL: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
  MONTH_YEAR: 'MMM yyyy',
  YEAR_MONTH: 'yyyy-MM',
  TIME: 'HH:mm',
} as const;

export function formatDate(
  date: Date | string | null | undefined,
  formatStr: string = DATE_FORMATS.DISPLAY,
  fallback: string = 'N/A'
): string {
  if (!date) return fallback;
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(parsed)) return fallback;
  return format(parsed, formatStr);
}

export function formatRelativeDate(
  date: Date | string,
  baseDate: Date = new Date()
): string {
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(parsed)) return 'Invalid date';
  return formatDistance(parsed, baseDate, { addSuffix: true });
}

export function getDaysUntil(date: Date | string): number {
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(parsed)) return 0;
  return differenceInDays(parsed, new Date());
}

export function isOverdue(date: Date | string): boolean {
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(parsed)) return false;
  return parsed < new Date();
}

/**
 * `'today'` ADDED (WAVE 1 PART 2, item 2/5): every existing member is a
 * ROLLING trailing window ("last 7 days" including any part of today),
 * which is the wrong shape for "today's trips" / "today's fuel spend" --
 * those need the CALENDAR day, from local midnight to now, so a KPI
 * scoped to it can only grow through the day rather than always
 * spanning a fixed 24 hours that slides under it.
 */
/**
 * `'7d'`/`'30d'` ADDED (WAVE 1 PART 2, item 4/5): the Vehicle Hub's
 * range selector spec names these exactly ("Today / 7d / 30d /
 * Custom"), and `'month'` is a calendar-month subtraction (28-31 days
 * depending which month it lands on) -- not what a label reading
 * exactly "30d" should mean. Precise, fixed-day-count windows, distinct
 * from the pre-existing `'week'`/`'month'` keys (kept as-is; nothing
 * else uses them yet, so this is purely additive).
 */
export function getDateRangePreset(
  preset: 'today' | '7d' | '30d' | 'week' | 'month' | 'quarter' | 'year'
): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case '7d':
      start.setDate(end.getDate() - 7);
      break;
    case '30d':
      start.setDate(end.getDate() - 30);
      break;
    case 'week':
      start.setDate(end.getDate() - 7);
      break;
    case 'month':
      start.setMonth(end.getMonth() - 1);
      break;
    case 'quarter':
      start.setMonth(end.getMonth() - 3);
      break;
    case 'year':
      start.setFullYear(end.getFullYear() - 1);
      break;
  }

  return { start, end };
}

export function toISODate(date: Date | string): string {
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  return format(parsed, DATE_FORMATS.API);
}

export function groupByMonth<T extends { date: Date }>(
  items: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const monthKey = format(item.date, DATE_FORMATS.YEAR_MONTH);
    if (!grouped.has(monthKey)) grouped.set(monthKey, []);
    grouped.get(monthKey)!.push(item);
  });
  return grouped;
}