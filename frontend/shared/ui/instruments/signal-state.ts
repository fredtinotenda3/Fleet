// frontend/shared/ui/instruments/signal-state.ts
//
// ---------------------------------------------------------------------
// PROVENANCE AS A TYPE, NOT A CONVENTION
// ---------------------------------------------------------------------
// The platform's central rule is that every displayed value is one of
// MEASURED, CALCULATED, ESTIMATED, UNAVAILABLE or NOT-APPLICABLE, and
// that the four are never conflated. That rule has been enforced so far
// by making backend fields nullable and trusting each render site to
// branch — which works, and which has also been re-fixed several times
// because a render site is easy to forget.
//
// An instrument cluster makes the stakes higher. A gauge is a picture of
// a measurement: a needle at zero and a needle with no signal look
// identical unless something deliberately makes them differ, and "0 rpm"
// reads as a stalled engine rather than as silence. So on this surface
// provenance is carried IN the value.
//
// `Signal<T>` cannot be rendered without answering the question, because
// there is no `.value` to reach for on an unavailable one.
//
// ---------------------------------------------------------------------
// WHY NOT-APPLICABLE IS SEPARATE FROM UNAVAILABLE
// ---------------------------------------------------------------------
// They look similar and mean opposite things to an operator:
//
//   UNAVAILABLE     the quantity exists for this vehicle and we do not
//                   have it. Something may be wrong — a sensor, a
//                   subscription, a provider. Worth investigating.
//   NOT-APPLICABLE  the quantity does not exist for this vehicle. An
//                   electric van has no engine speed; a trailer has no
//                   coolant. Nothing is wrong and nothing is missing.
//
// Rendering the second as the first sends someone to check a sensor that
// was never fitted. That is a support call the product creates for
// itself, which is why the distinction is in the type.
//
// Pure and dependency-free: jest here runs `testEnvironment: 'node'`
// with no jsdom, so anything that must be tested cannot live in JSX.

/** How a displayed value came to be known. */
export type Provenance = 'measured' | 'calculated' | 'estimated' | 'unavailable' | 'not-applicable';

export type Signal<T = number> =
  | { provenance: 'measured'; value: T; at?: Date }
  | { provenance: 'calculated'; value: T; method: string }
  | { provenance: 'estimated'; value: T; method: string; confidence?: 'low' | 'medium' | 'high' }
  | { provenance: 'unavailable'; reason?: string }
  | { provenance: 'not-applicable'; reason: string };

/** A reading straight from a provider. */
export function measured<T>(value: T, at?: Date): Signal<T> {
  return { provenance: 'measured', value, at };
}

/**
 * A value derived from other measurements by a stated rule.
 *
 * `method` is REQUIRED and is shown to the user. A derived figure whose
 * derivation cannot be named is indistinguishable from a guess, and the
 * finance controller's question — "where did this number come from?" —
 * has to be answerable from the screen.
 */
export function calculated<T>(value: T, method: string): Signal<T> {
  return { provenance: 'calculated', value, method };
}

/** A modelled value. `method` required for the same reason as `calculated`. */
export function estimated<T>(
  value: T,
  method: string,
  confidence?: 'low' | 'medium' | 'high'
): Signal<T> {
  return { provenance: 'estimated', value, method, confidence };
}

export function unavailable<T = number>(reason?: string): Signal<T> {
  return { provenance: 'unavailable', reason };
}

export function notApplicable<T = number>(reason: string): Signal<T> {
  return { provenance: 'not-applicable', reason };
}

/**
 * Lifts a possibly-absent reading into a Signal.
 *
 * The single most useful helper here, because it is the exact shape of
 * every optional telemetry field: `number | null | undefined` in, a
 * Signal out, with `null`/`undefined`/`NaN` all becoming UNAVAILABLE
 * rather than 0.
 */
export function fromReading(
  value: number | null | undefined,
  options: { at?: Date; reason?: string } = {}
): Signal<number> {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return unavailable(options.reason);
  }
  return measured(value, options.at);
}

/** True when the signal carries a number to draw. */
export function hasValue<T>(
  signal: Signal<T>
): signal is Extract<Signal<T>, { value: T }> {
  return (
    signal.provenance === 'measured' ||
    signal.provenance === 'calculated' ||
    signal.provenance === 'estimated'
  );
}

/**
 * The value, or `null`.
 *
 * Deliberately returns `null` rather than accepting a default: a caller
 * that wants a fallback must write it at the call site, where it is
 * visible in review, rather than receiving one silently from here.
 */
export function valueOf<T>(signal: Signal<T>): T | null {
  return hasValue(signal) ? signal.value : null;
}

/** The short badge text shown beside a gauge. */
export function provenanceLabel(provenance: Provenance): string {
  switch (provenance) {
    case 'measured':
      return 'LIVE';
    case 'calculated':
      return 'DERIVED';
    case 'estimated':
      return 'ESTIMATED';
    case 'unavailable':
      return 'NO DATA';
    case 'not-applicable':
      return 'N/A';
  }
}

/**
 * The explanation behind the badge.
 *
 * Written for an operator, not an engineer: it says what the number is
 * and — where it matters — what it is not. The unavailable case
 * deliberately states that the absence is not a reading of zero,
 * because that is the inference the badge exists to prevent.
 */
export function provenanceExplanation<T>(signal: Signal<T>): string {
  switch (signal.provenance) {
    case 'measured':
      return signal.at
        ? `Reported by the vehicle's tracker at ${signal.at.toLocaleTimeString()}.`
        : "Reported directly by the vehicle's tracker.";
    case 'calculated':
      return `Derived from other measurements: ${signal.method}.`;
    case 'estimated':
      return `Modelled, not measured: ${signal.method}.${
        signal.confidence ? ` Confidence: ${signal.confidence}.` : ''
      }`;
    case 'unavailable':
      return signal.reason
        ? `Not reported: ${signal.reason}. This is not a reading of zero.`
        : 'This vehicle is not reporting this signal. It is not a reading of zero.';
    case 'not-applicable':
      return `Does not apply to this vehicle: ${signal.reason}.`;
  }
}

/**
 * Freshness of a live reading.
 *
 * The seven states the spec asks for, collapsed to the five that are
 * actually distinguishable from a reading plus a device record. Ordered
 * from most to least trustworthy so a caller can compare them.
 */
export type Freshness = 'live' | 'recent' | 'stale' | 'last-known' | 'no-telemetry' | 'not-tracked';

/** Under this, a fix is current enough to drive a live gauge. */
export const LIVE_FIX_SECONDS = 120;
/** Under this, a fix is recent — shown, but no longer animated as live. */
export const RECENT_FIX_SECONDS = 15 * 60;
/** Beyond this the vehicle is treated as offline; matches OFFLINE_FIX_MINUTES server-side. */
export const OFFLINE_FIX_SECONDS = 60 * 60;

/**
 * Classifies a fix age.
 *
 * `isTracked: false` short-circuits to 'not-tracked' — a vehicle with no
 * device mapped is not a vehicle whose tracker has gone quiet, and
 * telling an operator to check a tracker that was never fitted wastes
 * their time. `fixAgeSeconds === null` means the device exists and has
 * never produced a fix.
 *
 * The thresholds mirror the server's own (`STALE_FIX_MINUTES = 15`,
 * `OFFLINE_FIX_MINUTES = 60` in live-map.service.ts) rather than
 * inventing client-side ones, so the map and the cluster cannot
 * disagree about whether a vehicle is stale.
 */
export function freshnessFor(
  fixAgeSeconds: number | null | undefined,
  options: { isTracked?: boolean } = {}
): Freshness {
  if (options.isTracked === false) return 'not-tracked';
  if (fixAgeSeconds === null || fixAgeSeconds === undefined) return 'no-telemetry';
  if (!Number.isFinite(fixAgeSeconds) || fixAgeSeconds < 0) return 'no-telemetry';

  if (fixAgeSeconds <= LIVE_FIX_SECONDS) return 'live';
  if (fixAgeSeconds <= RECENT_FIX_SECONDS) return 'recent';
  if (fixAgeSeconds <= OFFLINE_FIX_SECONDS) return 'stale';
  return 'last-known';
}

export interface FreshnessCopy {
  label: string;
  description: string;
  /** Whether a gauge should animate. Only a live fix earns motion. */
  animate: boolean;
  tone: 'positive' | 'neutral' | 'warning' | 'danger';
}

export function freshnessCopy(freshness: Freshness, fixAgeSeconds?: number | null): FreshnessCopy {
  const ago =
    fixAgeSeconds === null || fixAgeSeconds === undefined
      ? ''
      : fixAgeSeconds < 90
        ? `${Math.round(fixAgeSeconds)}s ago`
        : fixAgeSeconds < 5400
          ? `${Math.round(fixAgeSeconds / 60)} min ago`
          : `${Math.round(fixAgeSeconds / 3600)} h ago`;

  switch (freshness) {
    case 'live':
      return {
        label: 'Live',
        description: `Reporting normally${ago ? ` — last fix ${ago}` : ''}.`,
        animate: true,
        tone: 'positive',
      };
    case 'recent':
      return {
        label: 'Recent',
        description: `Last fix ${ago}. Current enough to act on, but not live.`,
        animate: false,
        tone: 'neutral',
      };
    case 'stale':
      return {
        label: 'Stale',
        description: `No fix for ${ago}. These readings are frozen at that moment, not current.`,
        animate: false,
        tone: 'warning',
      };
    case 'last-known':
      return {
        label: 'Last known',
        description: `The tracker stopped reporting ${ago}. This is where the vehicle was, not where it is.`,
        animate: false,
        tone: 'danger',
      };
    case 'no-telemetry':
      return {
        label: 'No telemetry',
        description: 'A tracker is mapped to this vehicle but has never reported a position.',
        animate: false,
        tone: 'danger',
      };
    case 'not-tracked':
      return {
        label: 'Not tracked',
        description:
          'No tracking device is mapped to this vehicle, so there is nothing to report. This is not a fault.',
        animate: false,
        tone: 'neutral',
      };
  }
}
