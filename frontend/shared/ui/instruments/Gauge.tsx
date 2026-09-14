// frontend/shared/ui/instruments/Gauge.tsx
//
// The dial. All of its correctness lives in the pure modules beside it
// (`gauge-geometry.ts`, `signal-state.ts`) so it can be tested under
// this repo's jsdom-less jest; this file is the SVG and the motion.
//
// ---------------------------------------------------------------------
// THE ONE RULE THIS COMPONENT ENFORCES
// ---------------------------------------------------------------------
// It takes a `Signal`, not a number. There is no way to pass it a bare
// value, so there is no way to render a gauge without having answered
// where the value came from. A needle at zero and a needle with no
// signal look identical on a dial, and "0 rpm" reads as a stalled
// engine — so an unavailable signal draws NO NEEDLE AT ALL, over a
// dimmed face, with the reason stated.
//
// ---------------------------------------------------------------------
// MOTION
// ---------------------------------------------------------------------
// The needle eases toward the last received value and stops there. It
// never predicts forward. That is the same line `marker-interpolation.ts`
// draws for map markers ("the marker lags reality; it never leads it"),
// and for the same reason: extrapolation draws a reading nobody
// measured.
//
// `animate={false}` (a stale or last-known fix) snaps instead. A moving
// needle is a claim of liveness, and making a frozen reading glide would
// be the product asserting something it does not know.

'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SWEEP,
  approachValue,
  arcPath,
  bandPath,
  buildTicks,
  needlePath,
  polarToCartesian,
  valueToAngle,
  type GaugeGeometry,
} from './gauge-geometry';
import {
  hasValue,
  provenanceExplanation,
  provenanceLabel,
  type Signal,
} from './signal-state';
import type { GaugeRange } from '@/frontend/modules/vehicles/utils/vehicle-profile';

const SIZE = 200;
const GEOMETRY: GaugeGeometry = { cx: SIZE / 2, cy: SIZE / 2, radius: 82, ...DEFAULT_SWEEP };

export interface GaugeProps {
  label: string;
  signal: Signal<number>;
  range: GaugeRange;
  /** e.g. 'km/h', 'rpm', '°C'. Rendered under the digital readout. */
  unit: string;
  /** Value spacing of the numbered ticks. */
  majorEvery: number;
  /** Divide the printed number, e.g. 1000 on a tachometer reading "×1000". */
  scaleDivisor?: number;
  scaleNote?: string;
  /** False for a stale/last-known fix: the needle snaps rather than gliding. */
  animate?: boolean;
  decimals?: number;
  className?: string;
}

export function Gauge({
  label,
  signal,
  range,
  unit,
  majorEvery,
  scaleDivisor = 1,
  scaleNote,
  animate = true,
  decimals = 0,
  className,
}: GaugeProps) {
  const target = hasValue(signal) ? signal.value : null;

  // The needle's own position, distinct from the target it is chasing.
  const [needleValue, setNeedleValue] = useState<number>(target ?? range.min);
  const frame = useRef<number | null>(null);
  const lastFrameAt = useRef<number>(0);
  const targetRef = useRef<number | null>(target);
  targetRef.current = target;

  useEffect(() => {
    if (target === null) return;

    if (!animate) {
      setNeedleValue(target);
      return;
    }

    const step = (now: number) => {
      const delta = lastFrameAt.current === 0 ? 16.7 : now - lastFrameAt.current;
      lastFrameAt.current = now;

      setNeedleValue((current) => {
        const next = approachValue(current, targetRef.current ?? current, delta);
        // Stop the loop once settled, rather than repainting forever.
        if (next !== targetRef.current) frame.current = requestAnimationFrame(step);
        else frame.current = null;
        return next;
      });
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      lastFrameAt.current = 0;
    };
  }, [target, animate]);

  const ticks = buildTicks(GEOMETRY, range.min, range.max, { majorEvery, minorPerMajor: 2 });
  const warnBand =
    range.warnAbove !== undefined
      ? bandPath(GEOMETRY, range.min, range.max, range.warnAbove, range.dangerAbove ?? range.max)
      : range.warnBelow !== undefined
        ? bandPath(GEOMETRY, range.min, range.max, range.dangerBelow ?? range.min, range.warnBelow)
        : null;
  const dangerBand =
    range.dangerAbove !== undefined
      ? bandPath(GEOMETRY, range.min, range.max, range.dangerAbove, range.max)
      : range.dangerBelow !== undefined
        ? bandPath(GEOMETRY, range.min, range.max, range.min, range.dangerBelow)
        : null;

  const unavailable = target === null;
  const angle = valueToAngle(needleValue, range.min, range.max, GEOMETRY);
  const badge = provenanceLabel(signal.provenance);
  const explanation = provenanceExplanation(signal);

  const readout = unavailable
    ? '—'
    : (target / scaleDivisor).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <figure className={cn('flex flex-col items-center', className)}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={cn('w-full max-w-[200px]', unavailable && 'opacity-45')}
        role="img"
        aria-label={`${label}: ${unavailable ? 'no data' : `${readout} ${unit}`}`}
      >
        {/* Dial face */}
        <path
          d={arcPath(GEOMETRY.cx, GEOMETRY.cy, GEOMETRY.radius, GEOMETRY.startAngle, GEOMETRY.endAngle)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={10}
          strokeLinecap="round"
        />

        {/*
          Warning bands are drawn even when the signal is unavailable:
          the dial's own scale is a property of the vehicle, not of this
          reading, and hiding it would make the empty gauge unreadable.
        */}
        {warnBand && (
          <path d={warnBand.path} fill="none" stroke="var(--warning)" strokeWidth={10} opacity={0.75} />
        )}
        {dangerBand && (
          <path d={dangerBand.path} fill="none" stroke="var(--danger)" strokeWidth={10} opacity={0.85} />
        )}

        {ticks.map((tick) => (
          <line
            key={tick.value}
            x1={tick.from.x}
            y1={tick.from.y}
            x2={tick.to.x}
            y2={tick.to.y}
            stroke="var(--muted-foreground)"
            strokeWidth={tick.major ? 2 : 1}
            opacity={tick.major ? 0.9 : 0.45}
          />
        ))}

        {ticks
          .filter((tick) => tick.major)
          .map((tick) => (
            <text
              key={`label-${tick.value}`}
              x={tick.labelAt.x}
              y={tick.labelAt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
            >
              {Math.round(tick.value / scaleDivisor)}
            </text>
          ))}

        {/*
          NO NEEDLE when there is no signal. This is the whole point: a
          needle resting at the minimum is a reading of the minimum.
        */}
        {!unavailable && (
          <>
            <path d={needlePath(GEOMETRY, angle)} className="fill-foreground" />
            <circle cx={GEOMETRY.cx} cy={GEOMETRY.cy} r={7} className="fill-foreground" />
            <circle cx={GEOMETRY.cx} cy={GEOMETRY.cy} r={3} fill="var(--background)" />
          </>
        )}
        {unavailable && (
          <circle
            cx={GEOMETRY.cx}
            cy={GEOMETRY.cy}
            r={7}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={2}
            strokeDasharray="3 3"
          />
        )}

        {/* Digital readout, in the 90° the sweep leaves free at the bottom. */}
        <text
          x={GEOMETRY.cx}
          y={GEOMETRY.cy + 34}
          textAnchor="middle"
          className={cn('font-semibold', unavailable ? 'fill-muted-foreground' : 'fill-foreground')}
          style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums' }}
        >
          {readout}
        </text>
        <text
          x={GEOMETRY.cx}
          y={GEOMETRY.cy + 52}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 10, letterSpacing: '0.08em' }}
        >
          {(scaleNote ? `${unit} ${scaleNote}` : unit).toUpperCase()}
        </text>
      </svg>

      <figcaption className="flex flex-col items-center gap-1 mt-1 text-center">
        <span className="font-medium text-body-sm text-foreground">{label}</span>
        {/*
          The provenance badge is not decoration. It is the difference
          between a measurement and a model, and it carries its own
          explanation so the finance controller's "where did this come
          from?" is answerable from the screen.
        */}
        <span
          title={explanation}
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide',
            signal.provenance === 'measured' && 'bg-success-bg text-success',
            signal.provenance === 'calculated' && 'bg-info-bg text-info',
            signal.provenance === 'estimated' && 'bg-warning-bg text-warning',
            (signal.provenance === 'unavailable' || signal.provenance === 'not-applicable') &&
              'bg-muted text-muted-foreground'
          )}
        >
          {badge}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * A compact bar for signals that do not warrant a full dial.
 *
 * Same contract: a `Signal`, never a number, and an unavailable one
 * renders an empty track rather than a bar at zero — which on a fuel
 * gauge would read as an empty tank.
 */
export function LinearGauge({
  label,
  signal,
  range,
  unit,
  decimals = 0,
  className,
}: Omit<GaugeProps, 'majorEvery' | 'animate' | 'scaleDivisor' | 'scaleNote'>) {
  const value = hasValue(signal) ? signal.value : null;
  const unavailable = value === null;
  const fraction =
    value === null ? 0 : Math.min(1, Math.max(0, (value - range.min) / (range.max - range.min)));

  const inDanger =
    value !== null &&
    ((range.dangerBelow !== undefined && value <= range.dangerBelow) ||
      (range.dangerAbove !== undefined && value >= range.dangerAbove));
  const inWarning =
    !inDanger &&
    value !== null &&
    ((range.warnBelow !== undefined && value <= range.warnBelow) ||
      (range.warnAbove !== undefined && value >= range.warnAbove));

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption text-muted-foreground">{label}</span>
        <span
          title={provenanceExplanation(signal)}
          className={cn(
            'text-body-sm font-medium tabular-nums',
            unavailable ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {unavailable
            ? provenanceLabel(signal.provenance) === 'N/A'
              ? 'N/A'
              : 'No data'
            : `${value.toFixed(decimals)} ${unit}`}
        </span>
      </div>
      <div className="w-full h-1.5 overflow-hidden rounded-full bg-muted">
        {/*
          Rendered only when there is a value. A zero-width bar and a
          bar at the minimum are visually identical, so the empty track
          IS the unavailable state.
        */}
        {!unavailable && (
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500',
              inDanger ? 'bg-danger' : inWarning ? 'bg-warning' : 'bg-primary'
            )}
            style={{ width: `${Math.max(2, fraction * 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Where a value sits on the dial, exported for the marker popup and any
 * caller that wants the angle without the SVG.
 */
export function gaugeAngleFor(value: number, range: GaugeRange): number {
  return valueToAngle(value, range.min, range.max, GEOMETRY);
}

export { polarToCartesian };
