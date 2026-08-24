// modules/telematics/services/odometer-reconciliation.ts
//
// PHASE 1 -- "which odometer do we believe?", in one place.
//
// ---------------------------------------------------------------------
// THE DEFECT
// ---------------------------------------------------------------------
// digital-twin.service.ts resolved the vehicle's odometer as:
//
//   latestTelemetry?.trip?.odometer ?? vehicle.odometer ?? 0
//
// Telemetry won unconditionally. There was no plausibility check, no
// monotonicity check, and no notion of which source was more recent.
// Combined with the Cartrack adapter's fabricated `odometer: 0` (F-2)
// that meant a real recorded odometer was replaced by a placeholder on
// every poll.
//
// Fixing F-2 removes the zero, but NOT the underlying problem: `??`
// only falls through on null/undefined, so any telemetry value at all --
// stale, rolled-back, or garbled -- still beats the vehicle record.
// Odometer readings go wrong in specific, well-known ways:
//
//   * a replacement head unit starts from 0 or from its own factory
//     value, so readings drop by tens of thousands of km overnight;
//   * a CAN bus glitch emits a value with an extra digit;
//   * a buffered device reconnects and replays a fix from last month,
//     which is genuinely older than what we already hold;
//   * a unit-conversion bug turns miles into kilometres or back.
//
// A guard is not optional once anything financial reads this number.
// Cost-per-km divides by distance travelled; an odometer that jumps to
// 0 and back produces a distance that is wrong by the whole odometer
// value, in both directions, on consecutive periods.
//
// ---------------------------------------------------------------------
// THE RULE
// ---------------------------------------------------------------------
// Telemetry is treated as a CANDIDATE, and the stored vehicle record as
// the incumbent. The candidate wins only if it is plausibly a later
// reading of the same odometer:
//
//   1. Absent, non-finite, or negative      -> reject ('missing')
//   2. Exactly 0                            -> reject ('zero')
//   3. No incumbent to compare against      -> accept ('no-baseline')
//   4. Lower than incumbent, beyond a small
//      tolerance                            -> reject ('regression')
//   5. Higher than incumbent by more than
//      the implausible-jump ceiling         -> reject ('implausible-jump')
//   6. Otherwise                            -> accept ('accepted')
//
// Every rejection returns a REASON. The caller keeps the incumbent value
// and can surface the reason; nothing is silently discarded, because
// "the odometer stopped moving" and "we are refusing this device's
// readings" are very different operational situations and an operator
// needs to tell them apart.
//
// ---------------------------------------------------------------------
// WHY THESE THRESHOLDS
// ---------------------------------------------------------------------
// REGRESSION_TOLERANCE_KM = 1. Odometers are cumulative and must not go
// backwards, but providers round: one reports 34853.05 and the next
// 34853, and a strict `<` would reject the second forever. One
// kilometre absorbs rounding and unit-precision differences without
// admitting a real rollback, which is always orders of magnitude
// larger.
//
// IMPLAUSIBLE_JUMP_KM = 5000. The ceiling is an ABSOLUTE distance, not
// the "> 2x the last known value" ratio the brief suggested, because a
// ratio behaves worst exactly where readings are least reliable: a new
// vehicle at 400 km legitimately passes 800 km within a fortnight and
// would be rejected, while a truck at 400,000 km could accept a
// 799,000 km reading -- an obvious garble -- because it happens to fall
// under 2x. A fixed ceiling is uniform across the fleet's age range.
//
// 5000 km is deliberately generous. A long-haul truck covers ~2,500
// km/week, and a backfill or a device that was offline for a month
// legitimately arrives with a large gap. The ceiling is there to catch
// an extra digit (a 10x garble) and a units mix-up, not to police
// normal operation. Set too tight, it would reject exactly the
// legitimate catch-up readings that matter most.
//
// Both are exported so tests pin them and so an operator reading the
// flag can see the number that produced it.
//
// ---------------------------------------------------------------------
// WHAT THIS IS NOT
// ---------------------------------------------------------------------
// Not a write path. This decides which value to DISPLAY and project; it
// does not modify tblvehicles, and a rejected reading is still stored in
// tbltelematics exactly as received. Discarding raw provider data would
// destroy the evidence needed to diagnose the device.

/** Rounding/precision slack, in km, before a lower reading counts as a rollback. */
export const REGRESSION_TOLERANCE_KM = 1;

/** Absolute ceiling, in km, on a single forward jump between readings. */
export const IMPLAUSIBLE_JUMP_KM = 5000;

export type OdometerRejectionReason =
  | 'missing'
  | 'zero'
  | 'regression'
  | 'implausible-jump';

export interface OdometerResolution {
  /** The value to use. Never null once a baseline or candidate exists. */
  value: number | null;
  /** Where `value` came from. */
  source: 'telemetry' | 'vehicle' | 'none';
  /** Set when a telemetry candidate was present but refused. */
  rejected?: {
    candidate: number;
    reason: OdometerRejectionReason;
    /** Human-readable, safe to surface in an operator-facing flag. */
    detail: string;
  };
}

/**
 * Decides whether a telemetry odometer reading may supersede the
 * vehicle's recorded odometer.
 *
 * @param candidate  odometer from the latest telemetry reading, km
 * @param incumbent  the vehicle record's odometer, km
 */
export function resolveOdometer(
  candidate: number | null | undefined,
  incumbent: number | null | undefined
): OdometerResolution {
  const baseline =
    typeof incumbent === 'number' && Number.isFinite(incumbent) && incumbent >= 0
      ? incumbent
      : null;

  const fallback = (): OdometerResolution =>
    baseline === null
      ? { value: null, source: 'none' }
      : { value: baseline, source: 'vehicle' };

  // 1. Absent / unusable.
  if (
    candidate === null ||
    candidate === undefined ||
    !Number.isFinite(candidate) ||
    candidate < 0
  ) {
    // No candidate at all is the ordinary case, not a rejection worth
    // flagging -- most providers simply do not report an odometer.
    return fallback();
  }

  // 2. Exactly zero. Kept as its own case rather than folded into the
  //    regression check because a 0 is the signature of a fabricated
  //    default (the F-2 bug) or a freshly-reset head unit, and it must
  //    be refused even when there is no baseline to regress from. A
  //    vehicle genuinely reading 0 km has never been driven, and that
  //    belongs in the vehicle record, not in a telemetry override.
  if (candidate === 0) {
    const result = fallback();
    return {
      ...result,
      rejected: {
        candidate,
        reason: 'zero',
        detail:
          'Telemetry reported an odometer of 0 km, which is treated as an unset or reset device value rather than a measurement.',
      },
    };
  }

  // 3. Nothing to compare against -- accept and establish the baseline.
  if (baseline === null) {
    return { value: candidate, source: 'telemetry' };
  }

  // 4. Backwards beyond rounding slack.
  if (candidate < baseline - REGRESSION_TOLERANCE_KM) {
    return {
      value: baseline,
      source: 'vehicle',
      rejected: {
        candidate,
        reason: 'regression',
        detail: `Telemetry odometer (${candidate} km) is lower than the recorded odometer (${baseline} km). Odometers do not decrease; this usually indicates a replaced or reset device.`,
      },
    };
  }

  // 5. Forward beyond the plausible ceiling.
  if (candidate > baseline + IMPLAUSIBLE_JUMP_KM) {
    return {
      value: baseline,
      source: 'vehicle',
      rejected: {
        candidate,
        reason: 'implausible-jump',
        detail: `Telemetry odometer (${candidate} km) exceeds the recorded odometer (${baseline} km) by more than ${IMPLAUSIBLE_JUMP_KM} km in a single step. This usually indicates a garbled reading or a unit mismatch.`,
      },
    };
  }

  // 6. A plausible forward reading (or equal, or within rounding slack).
  return { value: candidate, source: 'telemetry' };
}
