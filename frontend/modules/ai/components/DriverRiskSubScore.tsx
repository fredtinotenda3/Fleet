// frontend/modules/ai/components/DriverRiskSubScore.tsx
//
// Horizontal bar for one of DriverRiskScore.metrics' 0-100 sub-scores
// (safety, fatigue, distraction). Deliberately a plain styled div bar
// rather than a Recharts chart -- three independent single-value bars
// don't need an axis, tooltip, or legend, and a real progress bar is
// both lighter and reads faster at a glance than three tiny charts
// would.
//
// POLARITY WARNING: safetyScore is the one metric in
// DriverRiskScore.metrics where HIGHER = SAFER (100 - raw event
// penalty; see calculateSafetyScore/calculateOverallScore's
// `normalized.safetyScore = 100 - metrics.safetyScore` inversion for
// why the *overall* score has to flip it back). fatigueScore and
// distractionScore are both HIGHER = WORSE, matching overallScore's
// polarity. This component does not re-derive or flip anything --
// callers must pass `invert` for safetyScore specifically so the bar
// fill still reads red-when-bad across all three, since a driver
// disputing this score needs "red = bad" to hold consistently
// regardless of which metric they're looking at.

'use client';

import { cn } from '@/lib/utils';
import { formatSubScore } from '../utils/driver-risk.utils';

interface DriverRiskSubScoreProps {
  label: string;
  /** 0-100 raw value as it appears in DriverRiskScore.metrics. */
  score: number;
  /**
   * True for safetyScore only: flips the *displayed* fill so the bar
   * still reads "more filled + more red = worse" like fatigue/
   * distraction do, without altering the underlying number shown in
   * the caption (formatSubScore always renders the raw score).
   */
  invert?: boolean;
  className?: string;
}

function severityColor(displayValue: number): string {
  if (displayValue >= 65) return 'var(--destructive)';
  if (displayValue >= 40) return 'var(--warning)';
  return 'var(--success)';
}

export function DriverRiskSubScore({ label, score, invert = false, className }: DriverRiskSubScoreProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const displayValue = invert ? 100 - clamped : clamped;
  const color = severityColor(displayValue);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{formatSubScore(score)}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${displayValue}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
