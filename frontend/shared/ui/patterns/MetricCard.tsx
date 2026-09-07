// frontend/shared/ui/patterns/MetricCard.tsx

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { TONE_CLASSES, deltaTone, type Tone } from './tone';

export interface MetricDelta {
  /** Signed change. Percent unless `unit` says otherwise. */
  value: number;
  /**
   * REQUIRED. Whether a rising number is good news for THIS metric.
   * See the note on `deltaTone` in ./tone.ts — defaulting this is how the
   * previous stat cards ended up painting a 12% rise in cost per km green.
   */
  higherIsBetter: boolean;
  /** Defaults to '%'. Pass '' for an absolute change. */
  unit?: string;
  /** e.g. "vs last month". Rendered muted next to the delta. */
  comparisonLabel?: string;
}

export interface MetricCardProps {
  label: string;
  /**
   * The figure. `null`/`undefined` renders the `emptyValue` placeholder
   * rather than a zero — a fabricated 0 is indistinguishable from a real
   * measurement and is the most damaging thing a metric card can do.
   */
  value: React.ReactNode;
  /** Rendered smaller, immediately after the value (e.g. 'km', 'L/100km'). */
  unit?: string;
  /** One line of context under the figure. */
  hint?: string;
  icon?: React.ReactNode;
  delta?: MetricDelta;
  /** Colours the left rule and the icon. Use for a metric that is itself a status. */
  tone?: Tone;
  loading?: boolean;
  /**
   * Renders the card in an explicit "could not load" state instead of showing
   * a misleading figure. A metric card with no error branch silently reports
   * 0 when its fetch fails, which reads as a real measurement.
   */
  error?: boolean;
  errorMessage?: string;
  /** Turns the whole card into a link to the drill-down. */
  href?: string;
  /** Shown when `value` is null/undefined. */
  emptyValue?: string;
  className?: string;
  /** Extra content under the hint (sparkline, breakdown chips). */
  children?: React.ReactNode;
}

function DeltaIndicator({ delta }: { delta: MetricDelta }) {
  const { value, higherIsBetter, unit = '%', comparisonLabel } = delta;
  const tone = deltaTone(value, higherIsBetter);
  const flat = !Number.isFinite(value) || value === 0;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;

  // The sign is spelled out for assistive tech: an arrow glyph plus a colour
  // is two visual channels and zero textual ones.
  const srDirection = flat ? 'unchanged' : value > 0 ? 'up' : 'down';

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className={cn('inline-flex items-center gap-0.5 text-caption font-medium', TONE_CLASSES[tone].text)}>
        <Icon className="size-3 shrink-0" aria-hidden="true" />
        <span className="sr-only">{srDirection} </span>
        <span className="tabular-nums">
          {flat ? '0' : Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          {unit}
        </span>
      </span>
      {comparisonLabel && <span className="text-caption text-muted-foreground">{comparisonLabel}</span>}
    </div>
  );
}

/**
 * The single metric/KPI card for the whole platform.
 *
 * Consolidates three previously independent implementations —
 * `shared/ui/cards/StatsCard`, `frontend/shared/ui/data-display/StatisticCards`
 * and a scattering of hand-rolled div grids. Both of the named components now
 * delegate here, so their existing call sites (26 of them) inherit the token
 * palette, the tabular figures, the real error branch and the delta semantics
 * without any of them needing to change.
 *
 * Visual restraint is deliberate: a flat surface, a 1px border, one hairline
 * status rule and no gradient. The previous StatsCard painted a
 * `from-blue-500 to-blue-600` wash behind every card from raw Tailwind
 * palette colours that appear nowhere in this product's palette.
 */
export function MetricCard({
  label,
  value,
  unit,
  hint,
  icon,
  delta,
  tone = 'neutral',
  loading = false,
  error = false,
  errorMessage = 'Unavailable',
  href,
  emptyValue = 'No data',
  className,
  children,
}: MetricCardProps) {
  const isEmpty = value === null || value === undefined || value === '';

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {icon && (
          <span className={cn('shrink-0 [&>svg]:size-4', tone === 'neutral' ? 'text-muted-foreground' : TONE_CLASSES[tone].icon)}>
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      ) : error ? (
        <p className="mt-2 text-body-sm text-muted-foreground">{errorMessage}</p>
      ) : (
        <>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className={cn(
                'text-h2 tabular-nums leading-none',
                isEmpty ? 'text-muted-foreground text-h3 font-normal' : 'text-foreground'
              )}
            >
              {isEmpty ? emptyValue : value}
            </span>
            {!isEmpty && unit && <span className="text-body-sm text-muted-foreground">{unit}</span>}
          </div>

          {(hint || delta) && (
            <div className="mt-2 space-y-1">
              {delta && <DeltaIndicator delta={delta} />}
              {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
            </div>
          )}
        </>
      )}

      {children && <div className="mt-3">{children}</div>}

      {href && (
        <span className="mt-3 inline-flex items-center gap-1 text-caption font-medium text-primary">
          View detail
          <ArrowRight className="size-3" aria-hidden="true" />
        </span>
      )}
    </>
  );

  const shell = cn(
    'flex flex-col rounded-lg border border-border bg-card p-4 shadow-xs',
    // A hairline status rule rather than a tinted card: at the six-to-eight
    // cards a fleet dashboard shows at once, tinted backgrounds compete with
    // the figures they are supposed to be qualifying.
    tone !== 'neutral' && cn('border-l-2', TONE_CLASSES[tone].rule),
    href && 'transition-colors hover:border-primary/40 hover:bg-muted/40',
    className
  );

  if (href && !loading) {
    return (
      <Link href={href} className={cn(shell, 'focus-visible:ring-2 focus-visible:ring-ring')}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}

/**
 * The standard responsive grid for a KPI row.
 *
 * Mobile shows two columns rather than one: a fleet manager checking the
 * platform on a phone wants to compare figures, and a single-column stack
 * pushes the fourth metric below the fold for no benefit. `columns` caps the
 * desktop width so a three-metric row does not stretch each card to a quarter
 * of a 1920px display.
 */
export function MetricCardGrid({
  children,
  columns = 4,
  className,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-3 grid-cols-2 sm:gap-4',
        columns === 2 && 'lg:grid-cols-2',
        columns === 3 && 'lg:grid-cols-3',
        columns === 4 && 'md:grid-cols-2 lg:grid-cols-4',
        columns === 5 && 'md:grid-cols-3 lg:grid-cols-5',
        columns === 6 && 'md:grid-cols-3 lg:grid-cols-6',
        className
      )}
    >
      {children}
    </div>
  );
}
