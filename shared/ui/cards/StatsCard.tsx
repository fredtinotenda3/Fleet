// shared/ui/cards/StatsCard.tsx

'use client';

import { ReactNode } from 'react';
import { MetricCard } from '@/frontend/shared/ui/patterns/MetricCard';

interface StatsCardProps {
  title: string;
  /**
   * `null`/`undefined` renders `emptyValue` rather than a zero -- the
   * distinction between "not measured" and "measured zero".
   */
  value: ReactNode;
  icon?: ReactNode;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading?: boolean;
  /**
   * Renders "Unavailable" instead of a figure when the query behind this
   * card failed.
   *
   * ADDED (empty-organisation round): this adapter forwarded neither
   * `error` nor `emptyValue`, so every one of its call sites was
   * structurally unable to distinguish a failed request from a real
   * zero -- `VehicleStatsCards` printed four confident zeroes and a
   * green "Active: 0" over a backend outage. The capability existed on
   * `MetricCard` the whole time; only the pass-through was missing.
   */
  error?: boolean;
  errorMessage?: string;
  /** Shown when `value` is null/undefined, instead of a fabricated 0. */
  emptyValue?: string;
  /**
   * RETAINED FOR COMPATIBILITY, NO LONGER RENDERED.
   *
   * This used to select a hardcoded Tailwind gradient wash
   * (`from-blue-500 to-blue-600`, `from-green-500 …`) painted behind the
   * card at 5% opacity. Those are raw Tailwind palette colours that appear
   * nowhere in this product's token set, they did not respond to dark mode,
   * and they made every stat card carry decoration that told the reader
   * nothing. The prop is kept so the nine existing call sites keep compiling;
   * pass `tone` on `MetricCard` directly if a card genuinely needs to carry
   * a status.
   */
  color?: string;
  className?: string;
}

/**
 * Thin adapter over the shared `MetricCard`.
 *
 * Kept as its own module because nine files import this path; the component
 * no longer has any layout of its own, so `StatsCard` and `StatisticCard`
 * (the other, independently-written stat card this codebase had) now render
 * identically.
 *
 * NOTE on `trend`: the legacy API takes `isPositive`, which means "render
 * this as good news", not "the number went up". `MetricCard` asks the more
 * useful question (`higherIsBetter`) and derives the colour from the sign.
 * The translation below preserves each existing call site's current
 * appearance exactly — it maps whatever the caller declared as positive onto
 * an equivalent upward-good delta — rather than silently re-colouring nine
 * screens. New code should use `MetricCard` and state `higherIsBetter`.
 */
export function StatsCard({
  title,
  value,
  icon,
  description,
  trend,
  loading = false,
  error = false,
  errorMessage,
  emptyValue,
  className,
}: StatsCardProps) {
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
              // The legacy prop carries an unsigned magnitude plus a
              // "good/bad" flag. Re-express it as a signed delta whose sign
              // agrees with that flag under higherIsBetter:true, which
              // reproduces the old colour for every existing caller.
              value: trend.isPositive ? Math.abs(trend.value) : -Math.abs(trend.value),
              higherIsBetter: true,
              comparisonLabel: 'from last period',
            }
          : undefined
      }
    />
  );
}
