// frontend/shared/ui/instruments/gauge-geometry.ts
//
// ---------------------------------------------------------------------
// ARC MATH FOR THE INSTRUMENT CLUSTER
// ---------------------------------------------------------------------
// The codebase has no SVG arc, polar, or tick-mark helper of any kind --
// Recharts covers charts, and its one radial component (`RadialBarChart`,
// used once in DriverRiskGauge) draws a progress arc, not an instrument.
// A real dial needs a sweep that starts and ends at chosen angles, tick
// marks at chosen intervals, coloured warning bands over sub-ranges, and
// a needle. None of that is a bar chart.
//
// Pure functions, no React, no DOM: jest here runs with
// `testEnvironment: 'node'`, so this is the layer where the geometry can
// actually be asserted. The components above it become thin.
//
// ---------------------------------------------------------------------
// COORDINATES
// ---------------------------------------------------------------------
// SVG's y-axis points DOWN, and its 0° points right (east). Gauges are
// described here in the way an instrument is described in speech --
// "the sweep starts at seven o'clock and ends at five o'clock" -- and
// converted once, in `polarToCartesian`. Getting that conversion wrong
// in each component is how a cluster ends up with one dial mirrored.
//
// Angles in this module are DEGREES CLOCKWISE FROM 12 O'CLOCK, because
// that is how a dial face reads. 0 = top, 90 = right, 180 = bottom.

export interface Point {
  x: number;
  y: number;
}

export interface GaugeGeometry {
  /** Centre of the dial in viewBox units. */
  cx: number;
  cy: number;
  /** Radius of the value arc. */
  radius: number;
  /** Where the sweep begins, degrees clockwise from 12 o'clock. */
  startAngle: number;
  /** Where the sweep ends. Must be greater than startAngle. */
  endAngle: number;
}

/**
 * The default dial: a 270° sweep from 7 o'clock round to 5 o'clock.
 *
 * 270° is what almost every real automotive instrument uses. It leaves
 * the bottom 90° free for a digital readout, and it gives enough angular
 * travel that a needle's position is readable at a glance rather than
 * requiring the label.
 */
export const DEFAULT_SWEEP = { startAngle: 225, endAngle: 495 } as const;

/**
 * Polar to Cartesian, in SVG's coordinate space.
 *
 * `angleFromTop` is degrees clockwise from 12 o'clock. The `- 90` folds
 * SVG's east-facing zero onto a north-facing one; y is added rather than
 * subtracted because SVG's y grows downward.
 */
export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleFromTop: number
): Point {
  const radians = ((angleFromTop - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

/**
 * Maps a value onto its angle on the dial.
 *
 * CLAMPED at both ends, deliberately. A needle that swings past its stop
 * because a sensor reported an out-of-range value looks like a broken
 * instrument rather than a bad reading, and the warning band already
 * communicates "too high". Clamping is also what makes a gauge safe to
 * point at an unvalidated provider field.
 *
 * A zero-width range (min === max) returns the start angle rather than
 * dividing by zero.
 */
export function valueToAngle(
  value: number,
  min: number,
  max: number,
  geometry: Pick<GaugeGeometry, 'startAngle' | 'endAngle'>
): number {
  const span = max - min;
  if (span <= 0) return geometry.startAngle;
  const fraction = Math.min(1, Math.max(0, (value - min) / span));
  return geometry.startAngle + fraction * (geometry.endAngle - geometry.startAngle);
}

/**
 * An SVG path for the arc between two angles.
 *
 * `sweepFlag` is 1 (clockwise) throughout because every dial here sweeps
 * clockwise; `largeArcFlag` is computed rather than fixed, since a
 * 270° dial needs it set and a 40° warning band does not. Hard-coding
 * either is the classic way to get an arc that renders as its complement.
 */
export function arcPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return [
    'M', start.x.toFixed(3), start.y.toFixed(3),
    'A', radius, radius, 0, largeArcFlag, 1, end.x.toFixed(3), end.y.toFixed(3),
  ].join(' ');
}

export interface Tick {
  /** The value this tick marks. */
  value: number;
  angle: number;
  /** Start and end of the tick line. */
  from: Point;
  to: Point;
  /** Major ticks carry a printed number; minor ticks are unlabelled. */
  major: boolean;
  /** Where the number sits, for major ticks. */
  labelAt: Point;
}

/**
 * Tick marks across the dial.
 *
 * `majorEvery` is expressed in VALUE units, not in tick counts, so a
 * tachometer can label every 1000 rpm and a speedometer every 20 km/h
 * without either caller doing arithmetic. Minor ticks subdivide each
 * major interval.
 *
 * A dial with unlabelled ticks is decoration; the numbers are what make
 * it readable without a digital readout, which is the point of having a
 * dial at all.
 */
export function buildTicks(
  geometry: GaugeGeometry,
  min: number,
  max: number,
  options: { majorEvery: number; minorPerMajor?: number; tickLength?: number; labelInset?: number }
): Tick[] {
  const { majorEvery, minorPerMajor = 2, tickLength = 6, labelInset = 18 } = options;
  const span = max - min;
  if (span <= 0 || majorEvery <= 0) return [];

  const step = majorEvery / Math.max(1, minorPerMajor);
  const ticks: Tick[] = [];

  // Iterate on an integer index rather than accumulating a float, so a
  // step like 6.666 does not drift the last tick off the end of the dial.
  const count = Math.round(span / step);
  for (let i = 0; i <= count; i++) {
    const value = min + i * step;
    if (value > max + 1e-9) break;

    // Floating-point safe: 0.1 + 0.2 !== 0.3, so a modulo test on the
    // value itself misclassifies major ticks on non-integer steps.
    const major = Math.abs((value - min) / majorEvery - Math.round((value - min) / majorEvery)) < 1e-9;
    const angle = valueToAngle(value, min, max, geometry);
    const outer = polarToCartesian(geometry.cx, geometry.cy, geometry.radius, angle);
    const inner = polarToCartesian(
      geometry.cx,
      geometry.cy,
      geometry.radius - (major ? tickLength : tickLength * 0.55),
      angle
    );

    ticks.push({
      value: Math.round(value * 1000) / 1000,
      angle,
      from: outer,
      to: inner,
      major,
      labelAt: polarToCartesian(geometry.cx, geometry.cy, geometry.radius - labelInset, angle),
    });
  }

  return ticks;
}

export interface Band {
  from: number;
  to: number;
  path: string;
}

/**
 * A coloured band over a sub-range of the dial (redline, low-fuel zone).
 *
 * Returns `null` when the band would be empty or entirely outside the
 * dial, so a caller can render nothing rather than a zero-length path —
 * which some renderers draw as a dot at the arc's origin.
 */
export function bandPath(
  geometry: GaugeGeometry,
  min: number,
  max: number,
  from: number,
  to: number
): Band | null {
  const lo = Math.max(min, Math.min(from, to));
  const hi = Math.min(max, Math.max(from, to));
  if (!(hi > lo)) return null;

  return {
    from: lo,
    to: hi,
    path: arcPath(
      geometry.cx,
      geometry.cy,
      geometry.radius,
      valueToAngle(lo, min, max, geometry),
      valueToAngle(hi, min, max, geometry)
    ),
  };
}

/**
 * The needle, as a tapered triangle plus a tail.
 *
 * A line would be cheaper, but a needle has a direction and a line does
 * not: at a glance a symmetric line is ambiguous about which end is
 * pointing. The short counterweight tail is what real instruments use
 * for the same reason.
 */
export function needlePath(
  geometry: GaugeGeometry,
  angle: number,
  options: { length?: number; halfWidth?: number; tail?: number } = {}
): string {
  const { length = geometry.radius - 10, halfWidth = 3.2, tail = 9 } = options;
  const { cx, cy } = geometry;

  const tip = polarToCartesian(cx, cy, length, angle);
  const left = polarToCartesian(cx, cy, halfWidth, angle - 90);
  const right = polarToCartesian(cx, cy, halfWidth, angle + 90);
  const back = polarToCartesian(cx, cy, tail, angle + 180);

  return [
    `M ${tip.x.toFixed(2)} ${tip.y.toFixed(2)}`,
    `L ${left.x.toFixed(2)} ${left.y.toFixed(2)}`,
    `L ${back.x.toFixed(2)} ${back.y.toFixed(2)}`,
    `L ${right.x.toFixed(2)} ${right.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * Eases a needle toward a target.
 *
 * ---------------------------------------------------------------------
 * WHY THIS EXISTS AND WHAT IT DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------
 * A needle that jumps to each polled value looks like a spreadsheet
 * cell; a needle with momentum looks like an instrument. But this
 * codebase already draws a hard line on the difference between smoothing
 * and inventing: `marker-interpolation.ts` interpolates a marker BETWEEN
 * two known fixes and refuses dead reckoning outright, because
 * projecting forward would draw a vehicle somewhere no evidence places
 * it.
 *
 * The same line applies here. This function only ever moves the needle
 * TOWARD a value that has already been received. It never overshoots
 * past the target, never predicts the next reading, and never keeps
 * moving after the target is reached. The needle lags the data; it never
 * leads it.
 *
 * A critically-damped approach (exponential, no oscillation) rather than
 * a spring: a needle that wobbles past a value and settles back implies
 * the reading itself oscillated.
 *
 * `smoothing` is the fraction of the remaining distance covered per
 * frame at 60fps; it is scaled by `deltaMs` so the motion is identical
 * on a 30 Hz display and a 144 Hz one.
 */
export function approachValue(
  current: number,
  target: number,
  deltaMs: number,
  smoothing = 0.12
): number {
  if (!Number.isFinite(current)) return target;
  if (deltaMs <= 0) return current;

  const framesElapsed = deltaMs / (1000 / 60);
  const factor = 1 - Math.pow(1 - Math.min(0.95, Math.max(0.001, smoothing)), framesElapsed);
  const next = current + (target - current) * factor;

  // Snap when within a hair of the target, so a needle does not creep
  // asymptotically forever and force endless repaints.
  return Math.abs(target - next) < 0.01 ? target : next;
}
