'use client';

import { MetricCard, MetricCardGrid } from '@/frontend/shared/ui/patterns/MetricCard';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  /**
   * Widened from `string | number` to `React.ReactNode` so cards can
   * render richer content (e.g. a colored category badge) where a plain
   * number/string isn't expressive enough.
   */
  value: React.ReactNode;
  description?: string;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  /**
   * Renders "Unavailable" instead of a figure when the query behind this
   * card failed. Forwarded to `MetricCard`, which has always supported
   * it -- this adapter simply did not pass it on, which is why several
   * stat rows rendered a confident 0 over a failed request.
   */
  error?: boolean;
  errorMessage?: string;
  /** Shown when `value` is null/undefined, instead of a fabricated 0. */
  emptyValue?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Thin adapter over the shared `MetricCard`.
 *
 * This component and `shared/ui/cards/StatsCard` were two independently
 * written stat cards with different type scales, different trend colours
 * (`text-success`/`text-danger` here, raw `text-green-600`/`text-red-600`
 * there) and different loading behaviour — used side by side across seven
 * modules. Both now delegate to one implementation, so a KPI row looks the
 * same in Fuel as it does in Vehicles. All 17 call sites keep their existing
 * props.
 *
 * See the note in StatsCard.tsx on why `trend.isPositive` is translated
 * rather than passed through.
 */
export function StatisticCard({
  title,
  value,
  description,
  icon,
  trend,
  error = false,
  errorMessage,
  emptyValue,
  loading = false,
  className,
}: StatCardProps) {
  return (
    <MetricCard
      label={title}
      value={value}
      hint={description}
      icon={icon}
      loading={loading}
      error={error}
      errorMessage={errorMessage}
      emptyValue={emptyValue}
      className={className}
      delta={
        trend
          ? {
              value: trend.isPositive ? Math.abs(trend.value) : -Math.abs(trend.value),
              higherIsBetter: true,
            }
          : undefined
      }
    />
  );
}

interface StatisticCardsProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Grid wrapper. Delegates to `MetricCardGrid` so the breakpoints match every
 * other KPI row; `className` still wins, so callers that had already tuned
 * their column counts are unaffected.
 */
export function StatisticCards({ children, className }: StatisticCardsProps) {
  return <MetricCardGrid className={cn(className)}>{children}</MetricCardGrid>;
}
