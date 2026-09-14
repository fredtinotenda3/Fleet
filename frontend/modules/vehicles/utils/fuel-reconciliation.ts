// frontend/modules/vehicles/utils/fuel-reconciliation.ts
//
// WAVE 1 PART 2, item 4: fuel/trip reconciliation for the Vehicle
// Operational Hub.
//
// ---------------------------------------------------------------------
// THIS IS A FINANCIAL FEATURE, NOT A UI COMPARISON
// ---------------------------------------------------------------------
// "Expected fuel" and "variance" are numbers a fleet manager can use to
// challenge a driver, flag suspected siphoning, or justify a budget line
// to finance. A wrong or fabricated variance is worse than no variance
// at all -- it spends the platform's credibility and, downstream,
// someone's afternoon arguing with a number that was never real.
//
// Every value this module returns is a `FuelValue<T>`: a discriminated
// union that carries HOW the number was obtained, not just the number.
// There is no bare `number` anywhere in this file's public surface --
// see the type below for why that is the point, not an inconvenience.
//
// ---------------------------------------------------------------------
// THE LINEAGE (as specified)
// ---------------------------------------------------------------------
//   fuel transaction/log  -> actual litres/cost                (ACTUAL)
//   telemetry distance                                          (ACTUAL or ESTIMATED)
//   trusted consumption input/model                             (baseline efficiency)
//   calculated expected fuel/cost                               (CALCULATED)
//   variance                                                    (DERIVED)
//   provenance                                                  (carried on every value)
//
// ---------------------------------------------------------------------
// WHY THIS DOES NOT REUSE frontend/shared/ui/instruments/signal-state.ts
// ---------------------------------------------------------------------
// That file's `Signal<T>`/`Provenance` (measured | calculated | estimated
// | unavailable | not-applicable) is the platform's general instrument
// vocabulary, and reusing proven patterns instead of inventing new ones
// is the right default. It was deliberately NOT reused here, for a
// concrete reason rather than a stylistic one: the spec for this feature
// names SIX states -- ACTUAL, CALCULATED, DERIVED, ESTIMATED,
// UNAVAILABLE, NOT APPLICABLE -- and `signal-state.ts` already has only
// five, with `provenanceLabel('calculated')` returning the string
// "DERIVED" for the telemetry-gauge meaning of "computed from other
// measurements." Adding a sixth `'derived'` member to that shared type
// would make two different provenances both read "DERIVED" in different
// corners of the product, which is a worse outcome than a second,
// narrower type. `FuelValue<T>` below matches `Signal<T>`'s SHAPE
// exactly (discriminated union, `method` required wherever a number was
// computed, `reason` required wherever it is absent) so the pattern a
// reviewer already knows from the instrument cluster still applies --
// only the six-way vocabulary is specific to this financial feature.
//
// The two provenances this feature needs that signal-state.ts's don't
// distinguish:
//   CALCULATED  the output of the trusted-consumption MODEL applied to
//               this period's telemetry distance (expected fuel, expected
//               cost). Defensibility (see MIN_BASELINE_LOG_COUNT) is a
//               property of the model, checked once, before either
//               CALCULATED value is produced.
//   DERIVED     plain arithmetic composition of two values that are
//               ALREADY known (actual minus expected; a variance as a
//               percentage of expected). No model, no assumption -- just
//               subtraction/division of numbers already on the screen.
// Collapsing these into one "calculated" bucket (as the instrument
// cluster does) would hide the difference between "a model produced
// this" and "arithmetic produced this from two other numbers," which is
// exactly the distinction a controller asking "where did this number
// come from" needs answered.
//
// ---------------------------------------------------------------------
// THE TRUSTED CONSUMPTION MODEL, AND WHY IT IS NOT THE PERIOD'S OWN DATA
// ---------------------------------------------------------------------
// There is no rated/benchmark consumption figure anywhere in this
// platform (`shared/types/vehicle.types.ts` carries no such field) --
// grepped for one before writing this file. Inventing a fleet-average or
// hardcoded L/100km constant would be exactly the fabrication the spec
// prohibits ("never expose a variance unless the underlying inputs and
// calculation are defensible").
//
// The one real, already-computed per-vehicle consumption figure in the
// codebase is `FuelKpis.averageFuelEfficiency` (fuel.repository.ts,
// `getFuelKpis`/`summarize()`): real odometer-delta distance for a
// window (falling back to summed trip distance when no usable odometer
// range exists, tracked via `fallbackVehicleCount`/`fallbackPlates`)
// divided by that window's real fuel volume. This IS the platform's
// trusted consumption input, so it is reused rather than reinvented.
//
// It must come from a DIFFERENT, EARLIER window than the period being
// reconciled. Using the period's own efficiency as the "expected" rate
// would be circular -- `expected fuel` would collapse to `distance /
// (distance / actual fuel)`, which is just `actual fuel` again, and
// variance would always compute to zero regardless of what actually
// happened. See `BASELINE_WINDOW_DAYS` below for the window this module
// asks its caller to fetch.
//
// ---------------------------------------------------------------------
// WHERE THIS REFUSES TO GUESS
// ---------------------------------------------------------------------
//  1. Baseline not defensible (fewer than `MIN_BASELINE_LOG_COUNT` fuel
//     logs in the baseline window, or no usable distance/fuel pair to
//     divide) -> the ENTIRE reconciliation is UNAVAILABLE. No expected
//     fuel, no variance, at all -- there is no trustworthy rate to apply.
//  2. Period distance is zero. `FuelKpis.totalDistance` collapsing to 0
//     is genuinely ambiguous in the underlying aggregation: it means
//     EITHER "this vehicle truly did not move" OR "neither an odometer
//     bracket nor a trip-distance fallback was available" -- the
//     aggregation does not (today) tell the two apart (see the
//     DEFERRED note at the bottom of this file). Rather than assume the
//     zero is real, this module treats a zero-or-missing period distance
//     as UNAVAILABLE distance, which cascades to UNAVAILABLE expected
//     fuel/cost/variance. A real "vehicle sat still" period will
//     legitimately show as unavailable rather than as a confident
//     "0 expected, 0 variance" -- the conservative direction to be wrong
//     in for a number someone may act on.
//  3. Period fuel actuals are different: `FuelStats.logCount === 0` is
//     NOT ambiguous -- it is a direct count of matching documents in a
//     tenant/org-unit/vehicle/date-scoped query, so "zero logs" can only
//     mean "no fuel was purchased in this period," which is a real fact,
//     not a gap. Actual fuel/cost of exactly 0 in that case is reported
//     as ACTUAL, with an explanatory reason, not withheld.
//  4. No fuel purchased this period (logCount === 0) -> there is no
//     price actually paid this period, so this module does not borrow a
//     price from the baseline window to manufacture an expected cost.
//     Expected/variance COST becomes UNAVAILABLE while expected/variance
//     FUEL (a pure distance/efficiency calculation, no price involved)
//     can still be produced.
//  5. Electric vehicles: gated to NOT-APPLICABLE by the caller passing
//     `isElectric` (from `vehicleProfileFor(vehicle_type, fuel_type)`,
//     the same resolver the instrument cluster uses) -- an EV has no
//     fuel logs to reconcile by definition, not merely a vehicle for
//     which today's figure happens to be missing.
//
// Pure and dependency-free: jest here runs `testEnvironment: 'node'` with
// no jsdom, so calculation logic that must be unit-tested cannot live
// inside a client component.

/** How a reconciliation figure was obtained. Six states, matching the spec exactly. */
export type FuelProvenance =
  | 'actual'
  | 'calculated'
  | 'derived'
  | 'estimated'
  | 'unavailable'
  | 'not-applicable';

export type FuelValue<T = number> =
  | { provenance: 'actual'; value: T; source: string }
  | { provenance: 'calculated'; value: T; method: string }
  | { provenance: 'derived'; value: T; method: string }
  | { provenance: 'estimated'; value: T; method: string; confidence: 'low' | 'medium' | 'high' }
  | { provenance: 'unavailable'; reason: string }
  | { provenance: 'not-applicable'; reason: string };

export function actualValue<T>(value: T, source: string): FuelValue<T> {
  return { provenance: 'actual', value, source };
}
export function calculatedValue<T>(value: T, method: string): FuelValue<T> {
  return { provenance: 'calculated', value, method };
}
export function derivedValue<T>(value: T, method: string): FuelValue<T> {
  return { provenance: 'derived', value, method };
}
export function estimatedValue<T>(
  value: T,
  method: string,
  confidence: 'low' | 'medium' | 'high' = 'medium'
): FuelValue<T> {
  return { provenance: 'estimated', value, method, confidence };
}
export function fuelUnavailable<T = number>(reason: string): FuelValue<T> {
  return { provenance: 'unavailable', reason };
}
export function fuelNotApplicable<T = number>(reason: string): FuelValue<T> {
  return { provenance: 'not-applicable', reason };
}

/** True when the value carries a number to render (everything but unavailable/not-applicable). */
export function hasFuelValue<T>(fv: FuelValue<T>): fv is Extract<FuelValue<T>, { value: T }> {
  return (
    fv.provenance === 'actual' ||
    fv.provenance === 'calculated' ||
    fv.provenance === 'derived' ||
    fv.provenance === 'estimated'
  );
}

export function fuelValueOf<T>(fv: FuelValue<T>): T | null {
  return hasFuelValue(fv) ? fv.value : null;
}

/** The short badge text -- deliberately the literal words the spec names, not a paraphrase. */
export function fuelProvenanceLabel(provenance: FuelProvenance): string {
  switch (provenance) {
    case 'actual':
      return 'ACTUAL';
    case 'calculated':
      return 'CALCULATED';
    case 'derived':
      return 'DERIVED';
    case 'estimated':
      return 'ESTIMATED';
    case 'unavailable':
      return 'UNAVAILABLE';
    case 'not-applicable':
      return 'NOT APPLICABLE';
  }
}

/** The explanation behind the badge, written for whoever has to defend this number to finance. */
export function fuelProvenanceExplanation<T>(fv: FuelValue<T>): string {
  switch (fv.provenance) {
    case 'actual':
      return `Recorded directly: ${fv.source}.`;
    case 'calculated':
      return `Calculated from the trusted consumption model: ${fv.method}.`;
    case 'derived':
      return `Arithmetic from the actual and calculated figures above: ${fv.method}.`;
    case 'estimated':
      return `Modelled, not measured: ${fv.method} (confidence: ${fv.confidence}).`;
    case 'unavailable':
      return `Not available: ${fv.reason}. This is not a reading of zero.`;
    case 'not-applicable':
      return `Does not apply: ${fv.reason}.`;
  }
}

/**
 * Fewer fuel logs than this in the baseline window means there is not
 * enough history to trust the resulting L/km rate -- a single fill-up
 * either side of a long, unrepresentative drive can swing "average"
 * efficiency by a large margin. Three is the same order-of-magnitude
 * threshold `getFuelKpis`'s own abnormal-consumption detector implicitly
 * relies on (it compares each log against a per-vehicle average that is
 * equally thin with fewer than a handful of points) -- chosen here
 * explicitly and named so it can be tuned in one place if operations
 * feedback says otherwise.
 */
export const MIN_BASELINE_LOG_COUNT = 3;

/**
 * How far back the trusted-consumption baseline looks, ending
 * immediately before the reconciliation period starts (never
 * overlapping it -- see the file header for why overlap would be
 * circular). 90 days matches `getFuelKpis`'s own default lookback when
 * no explicit range is given, so this asks for nothing the rest of the
 * fuel module doesn't already consider a reasonable amount of history.
 */
export const BASELINE_WINDOW_DAYS = 90;

/** Computes the baseline window for a reconciliation period, per the rule above. */
export function baselineWindowFor(periodStart: Date): { startDate: Date; endDate: Date } {
  const endDate = new Date(periodStart.getTime() - 1);
  const startDate = new Date(endDate.getTime() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { startDate, endDate };
}

export interface FuelReconciliationPeriodData {
  /** `FuelStats.totalFuel` for the selected period, this vehicle only. */
  totalFuel: number;
  /** `FuelStats.totalCost` for the selected period, this vehicle only. */
  totalCost: number;
  /** `FuelStats.logCount` for the selected period -- 0 is an unambiguous, real fact. */
  logCount: number;
  /** `FuelKpis.totalDistance` for the SAME period/vehicle scope. */
  totalDistance: number;
  /** `FuelKpis.fallbackPlates` for the same call -- tells us HOW `totalDistance` was obtained. */
  fallbackPlates: string[];
}

export interface FuelReconciliationBaselineData {
  /** `FuelKpis.averageFuelEfficiency` for `baselineWindowFor(periodStart)`, this vehicle only. */
  averageFuelEfficiency: number;
  /** `FuelStats.logCount` for the SAME baseline window/vehicle scope -- the defensibility gate. */
  logCount: number;
}

export interface FuelReconciliationInput {
  licensePlate: string;
  /** From `vehicleProfileFor(vehicle.vehicle_type, vehicle.fuel_type).isElectric`. */
  isElectric: boolean;
  period: FuelReconciliationPeriodData;
  baseline: FuelReconciliationBaselineData;
}

export interface FuelReconciliationResult {
  /** Whether a defensible baseline exists at all -- UI can lead with this. */
  isDefensible: boolean;
  actualFuel: FuelValue;
  actualCost: FuelValue;
  distance: FuelValue;
  baselineEfficiency: FuelValue;
  expectedFuel: FuelValue;
  expectedCost: FuelValue;
  fuelVariance: FuelValue;
  fuelVariancePercent: FuelValue;
  costVariance: FuelValue;
}

/**
 * The pure calculation. No I/O, no dates-as-of-now (`baselineWindowFor`
 * is the caller's job, so this function is trivially testable with fixed
 * inputs) -- everything it needs is already resolved into the two
 * plain-data structs above.
 */
export function computeFuelReconciliation(input: FuelReconciliationInput): FuelReconciliationResult {
  const { licensePlate, isElectric, period, baseline } = input;

  if (isElectric) {
    const na = fuelNotApplicable<number>(
      `${licensePlate} is an electric vehicle; fuel-consumption reconciliation does not apply to it.`
    );
    return {
      isDefensible: false,
      actualFuel: na,
      actualCost: na,
      distance: na,
      baselineEfficiency: na,
      expectedFuel: na,
      expectedCost: na,
      fuelVariance: na,
      fuelVariancePercent: na,
      costVariance: na,
    };
  }

  // ---- Step 1: is the trusted consumption model defensible at all? ----
  const baselineDefensible = baseline.logCount >= MIN_BASELINE_LOG_COUNT && baseline.averageFuelEfficiency > 0;

  const baselineEfficiency: FuelValue = baselineDefensible
    ? calculatedValue(
        baseline.averageFuelEfficiency,
        `Average of distance ÷ fuel volume over the ${BASELINE_WINDOW_DAYS} days immediately before this period (${baseline.logCount} fuel logs).`
      )
    : fuelUnavailable(
        baseline.logCount < MIN_BASELINE_LOG_COUNT
          ? `Not enough fuel history to establish a trusted consumption rate for ${licensePlate} (need at least ${MIN_BASELINE_LOG_COUNT} fuel logs in the ${BASELINE_WINDOW_DAYS} days before this period; found ${baseline.logCount}).`
          : `Fuel logs exist for ${licensePlate} in the ${BASELINE_WINDOW_DAYS} days before this period, but no odometer or trip-distance data was available to calculate a consumption rate from them.`
    );

  // ---- Step 2: actual fuel/cost for the period -- always resolvable. ----
  // logCount === 0 is an unambiguous fact (see file header, point 3): a
  // real zero, not a gap.
  const actualFuel: FuelValue =
    period.logCount > 0
      ? actualValue(period.totalFuel, `${period.logCount} fuel log(s) recorded for ${licensePlate} in this period.`)
      : actualValue(0, `No fuel logs recorded for ${licensePlate} in this period.`);

  const actualCost: FuelValue =
    period.logCount > 0
      ? actualValue(period.totalCost, `${period.logCount} fuel log(s) recorded for ${licensePlate} in this period.`)
      : actualValue(0, `No fuel logs recorded for ${licensePlate} in this period.`);

  // ---- Step 3: the period's telemetry distance -- ambiguous at zero. ----
  const usedFallbackDistance = period.fallbackPlates.includes(licensePlate);
  const distance: FuelValue =
    period.totalDistance > 0
      ? usedFallbackDistance
        ? estimatedValue(
            period.totalDistance,
            'Summed from this vehicle’s recorded trips in this period (no usable odometer bracket from fuel logs).',
            'medium'
          )
        : actualValue(period.totalDistance, 'Odometer readings recorded on this period’s fuel logs.')
      : fuelUnavailable(
          `No odometer bracket or trip-distance record is available for ${licensePlate} in this period, so distance travelled cannot be confirmed. This is not the same as confirming the vehicle travelled zero distance.`
        );

  // ---- Step 4: expected fuel -- needs both a defensible baseline AND a known distance. ----
  let expectedFuel: FuelValue;
  if (!hasFuelValue(baselineEfficiency)) {
    expectedFuel = fuelUnavailable(
      'No trusted consumption rate is available for this vehicle (see the consumption rate above).'
    );
  } else if (!hasFuelValue(distance)) {
    expectedFuel = fuelUnavailable(
      'Distance travelled in this period is unavailable, so expected fuel consumption cannot be calculated.'
    );
  } else {
    const rate = baselineEfficiency.value; // km per litre
    expectedFuel = calculatedValue(
      distance.value / rate,
      `${distance.value.toFixed(1)} km ÷ ${rate.toFixed(2)} km/L (this vehicle’s baseline consumption rate).`
    );
  }

  // ---- Step 5: fuel variance -- pure subtraction of two already-known values. ----
  const fuelVariance: FuelValue =
    hasFuelValue(actualFuel) && hasFuelValue(expectedFuel)
      ? derivedValue(actualFuel.value - expectedFuel.value, 'Actual fuel − expected fuel.')
      : fuelUnavailable('Expected fuel consumption is unavailable, so a variance cannot be derived.');

  const fuelVariancePercent: FuelValue =
    hasFuelValue(fuelVariance) && hasFuelValue(expectedFuel) && expectedFuel.value > 0
      ? derivedValue(
          (fuelVariance.value / expectedFuel.value) * 100,
          'Fuel variance ÷ expected fuel × 100.'
        )
      : fuelUnavailable('Expected fuel consumption is unavailable or zero, so a variance percentage cannot be derived.');

  // ---- Step 6: cost -- only defensible when a real price was paid THIS period. ----
  const periodUnitCostKnown = period.logCount > 0 && period.totalFuel > 0;
  const unitCostActual = periodUnitCostKnown ? period.totalCost / period.totalFuel : null;

  let expectedCost: FuelValue;
  if (!hasFuelValue(expectedFuel)) {
    expectedCost = fuelUnavailable('Expected fuel consumption is unavailable, so an expected cost cannot be calculated.');
  } else if (unitCostActual === null) {
    expectedCost = fuelUnavailable(
      'No fuel was purchased for this vehicle in this period, so there is no actual price to apply to the expected fuel volume.'
    );
  } else {
    expectedCost = calculatedValue(
      expectedFuel.value * unitCostActual,
      `${expectedFuel.value.toFixed(1)} L expected × ${unitCostActual.toFixed(2)} (this period’s actual average price per litre).`
    );
  }

  const costVariance: FuelValue =
    hasFuelValue(actualCost) && hasFuelValue(expectedCost)
      ? derivedValue(actualCost.value - expectedCost.value, 'Actual cost − expected cost.')
      : fuelUnavailable('Expected cost is unavailable, so a cost variance cannot be derived.');

  return {
    isDefensible: baselineDefensible,
    actualFuel,
    actualCost,
    distance,
    baselineEfficiency,
    expectedFuel,
    expectedCost,
    fuelVariance,
    fuelVariancePercent,
    costVariance,
  };
}

// ---------------------------------------------------------------------
// DEFERRED (see the Wave 1 Part 2 checkpoint report)
// ---------------------------------------------------------------------
// `FuelKpis.totalDistance`/`summarize()` in fuel.repository.ts cannot
// itself distinguish "this vehicle travelled zero distance" from "no
// odometer bracket or trip fallback was available" -- both collapse to
// the same `0`. This module treats that ambiguity conservatively (point
// 2 in the file header), which is correct but means a vehicle that
// GENUINELY sat idle for an entire period will show "distance
// unavailable" rather than a confident zero. Resolving this properly
// means adding an explicit boolean (e.g. `hasDistanceSignal`) to
// `VehiclePeriodAggregate`/`FuelKpis` in the repository itself, which
// touches every existing fuel KPI card fleet-wide and was judged out of
// scope for this vertical slice.
