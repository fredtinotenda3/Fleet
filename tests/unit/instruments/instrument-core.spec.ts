// tests/unit/instruments/instrument-core.spec.ts
//
// ---------------------------------------------------------------------
// THE THREE PURE LAYERS UNDER THE INSTRUMENT CLUSTER
// ---------------------------------------------------------------------
// jest here runs `testEnvironment: 'node'` with no jsdom, so a gauge's
// correctness has to live outside JSX to be testable at all. Everything
// that could be wrong in a way a user would notice is in one of these
// three modules, and the React components above them are thin:
//
//   signal-state.ts     provenance and freshness -- the rule that an
//                       absent reading never renders as zero
//   vehicle-profile.ts  which dial to draw for which vehicle
//   gauge-geometry.ts   where the needle, ticks and bands actually go
//
// The single most important property asserted here is the first one: a
// gauge is a picture of a measurement, and a needle at zero looks
// identical to a needle with no signal unless something deliberately
// makes them differ.

import {
  measured,
  calculated,
  estimated,
  unavailable,
  notApplicable,
  fromReading,
  hasValue,
  valueOf,
  provenanceLabel,
  provenanceExplanation,
  freshnessFor,
  freshnessCopy,
  LIVE_FIX_SECONDS,
  RECENT_FIX_SECONDS,
  OFFLINE_FIX_SECONDS,
  type Provenance,
} from '../../../frontend/shared/ui/instruments/signal-state';
import {
  vehicleClassFor,
  vehicleProfileFor,
  isElectricDrivetrain,
  bandFor,
  DEFAULT_VEHICLE_CLASS,
  type VehicleClass,
} from '../../../frontend/modules/vehicles/utils/vehicle-profile';
import {
  polarToCartesian,
  valueToAngle,
  arcPath,
  buildTicks,
  bandPath,
  needlePath,
  approachValue,
  DEFAULT_SWEEP,
  type GaugeGeometry,
} from '../../../frontend/shared/ui/instruments/gauge-geometry';

const GEOMETRY: GaugeGeometry = { cx: 100, cy: 100, radius: 80, ...DEFAULT_SWEEP };

// ─────────────────────────────────────────────────────────────────────
// Provenance
// ─────────────────────────────────────────────────────────────────────
describe('an absent reading never becomes a zero', () => {
  it('lifts null, undefined and NaN to UNAVAILABLE', () => {
    for (const input of [null, undefined, NaN, Infinity, -Infinity]) {
      const signal = fromReading(input as number | null | undefined);
      expect({ input: String(input), provenance: signal.provenance }).toEqual({
        input: String(input),
        provenance: 'unavailable',
      });
      expect(valueOf(signal)).toBeNull();
    }
  });

  it('preserves a GENUINE zero as a measurement', () => {
    // The other half of the rule, and the easier one to get wrong by
    // over-correcting: a stationary vehicle really is doing 0 km/h, and
    // a fuel tank really can be empty.
    const signal = fromReading(0);
    expect(signal.provenance).toBe('measured');
    expect(valueOf(signal)).toBe(0);
  });

  it('an unavailable signal has no value to reach for', () => {
    // The type is the enforcement: there is no `.value` on this variant,
    // so a render site cannot forget to branch.
    const signal = unavailable<number>('no sensor fitted');
    expect(hasValue(signal)).toBe(false);
    expect(valueOf(signal)).toBeNull();
  });

  it('valueOf returns null rather than accepting a silent default', () => {
    // A default supplied here would be invisible in review. A caller
    // that wants one must write it at the call site.
    expect(valueOf(unavailable())).toBeNull();
    expect(valueOf(notApplicable('electric drivetrain'))).toBeNull();
  });
});

describe('NOT-APPLICABLE is distinct from UNAVAILABLE', () => {
  it('carries a different label and a different explanation', () => {
    // They look similar and mean opposite things: one says "something
    // may be wrong", the other says "nothing is missing". Conflating
    // them sends someone to check a sensor that was never fitted.
    expect(provenanceLabel('unavailable')).toBe('NO DATA');
    expect(provenanceLabel('not-applicable')).toBe('N/A');
    expect(provenanceLabel('unavailable')).not.toBe(provenanceLabel('not-applicable'));
  });

  it('the unavailable explanation states it is not a reading of zero', () => {
    // That inference is precisely what the badge exists to prevent.
    expect(provenanceExplanation(unavailable())).toMatch(/not a reading of zero/i);
    expect(provenanceExplanation(unavailable('tracker offline'))).toMatch(/not a reading of zero/i);
  });

  it('the not-applicable explanation never suggests a fault', () => {
    const text = provenanceExplanation(notApplicable('electric drivetrain has no engine speed'));
    expect(text).toMatch(/does not apply/i);
    expect(text).not.toMatch(/not reported|no data|zero/i);
  });

  it('every provenance has a label and an explanation', () => {
    const all: Provenance[] = ['measured', 'calculated', 'estimated', 'unavailable', 'not-applicable'];
    for (const provenance of all) {
      expect(provenanceLabel(provenance).length).toBeGreaterThan(0);
    }
    expect(provenanceExplanation(measured(42, new Date('2026-01-01T08:30:00Z')))).toContain('tracker');
    expect(provenanceExplanation(calculated(42, 'distance ÷ fuel'))).toContain('distance ÷ fuel');
    expect(provenanceExplanation(estimated(42, 'class average', 'low'))).toMatch(/low/);
  });

  it('a derived or modelled value must name its method', () => {
    // A derived figure whose derivation cannot be named is
    // indistinguishable from a guess. The finance controller's question
    // has to be answerable from the screen.
    const derived = calculated(7.4, 'litres ÷ distance × 100');
    const modelled = estimated(7.4, 'fleet average for this vehicle class');
    expect(provenanceExplanation(derived)).toContain('litres ÷ distance × 100');
    expect(provenanceExplanation(modelled)).toContain('fleet average');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Freshness
// ─────────────────────────────────────────────────────────────────────
describe('freshness distinguishes silence from absence', () => {
  it('classifies each band', () => {
    expect(freshnessFor(5)).toBe('live');
    expect(freshnessFor(LIVE_FIX_SECONDS)).toBe('live');
    expect(freshnessFor(LIVE_FIX_SECONDS + 1)).toBe('recent');
    expect(freshnessFor(RECENT_FIX_SECONDS)).toBe('recent');
    expect(freshnessFor(RECENT_FIX_SECONDS + 1)).toBe('stale');
    expect(freshnessFor(OFFLINE_FIX_SECONDS)).toBe('stale');
    expect(freshnessFor(OFFLINE_FIX_SECONDS + 1)).toBe('last-known');
  });

  it('an untracked vehicle is NOT a silent tracker', () => {
    // Telling an operator to check a device that was never fitted wastes
    // their time, so this short-circuits ahead of every age test.
    expect(freshnessFor(null, { isTracked: false })).toBe('not-tracked');
    expect(freshnessFor(10, { isTracked: false })).toBe('not-tracked');
    expect(freshnessCopy('not-tracked').description).toMatch(/not a fault/i);
  });

  it('a mapped device that has never reported is no-telemetry', () => {
    expect(freshnessFor(null)).toBe('no-telemetry');
    expect(freshnessFor(undefined)).toBe('no-telemetry');
    expect(freshnessFor(-1)).toBe('no-telemetry');
  });

  it('ONLY a live fix earns animation', () => {
    // Animating a stale reading is the product asserting liveness it
    // does not have — the exact thing §5.7 forbids.
    expect(freshnessCopy('live').animate).toBe(true);
    for (const state of ['recent', 'stale', 'last-known', 'no-telemetry', 'not-tracked'] as const) {
      expect({ state, animate: freshnessCopy(state).animate }).toEqual({ state, animate: false });
    }
  });

  it('a last-known fix says it is where the vehicle WAS', () => {
    expect(freshnessCopy('last-known', 7200).description).toMatch(/where the vehicle was/i);
  });

  it('a stale fix says the readings are frozen, not current', () => {
    expect(freshnessCopy('stale', 1800).description).toMatch(/frozen|not current/i);
  });

  it('mirrors the server thresholds rather than inventing client ones', () => {
    // live-map.service.ts: STALE_FIX_MINUTES = 15, OFFLINE_FIX_MINUTES = 60.
    // If these drift, the map and the cluster disagree about the same vehicle.
    expect(RECENT_FIX_SECONDS).toBe(15 * 60);
    expect(OFFLINE_FIX_SECONDS).toBe(60 * 60);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Vehicle profiles
// ─────────────────────────────────────────────────────────────────────
describe('the dial is scaled to the vehicle', () => {
  it('resolves the real free-text values this deployment holds', () => {
    // vehicle_type is a free string, not an enum, and the live data has
    // padding and inconsistent casing — see vehicle-glyph.ts's note.
    expect(vehicleClassFor('      DAF   TRUCK   ')).toBe('light-truck');
    expect(vehicleClassFor('Sedan')).toBe('light-vehicle');
    expect(vehicleClassFor('bus')).toBe('bus');
    expect(vehicleClassFor('Motorcycle')).toBe('motorcycle');
    expect(vehicleClassFor('Forklift')).toBe('plant');
    expect(vehicleClassFor('Tractor')).toBe('plant');
  });

  it('keeps the vehicle-glyph priority decisions rather than re-deciding them', () => {
    // Both files classify the same free text and must not disagree.
    expect(vehicleClassFor('truck trailer')).toBe('trailer');
    expect(vehicleClassFor('pickup truck')).toBe('light-vehicle');
  });

  it('falls back to a class that under-scales rather than over-scales', () => {
    // A heavy-truck dial pins the needle for an ordinary car;
    // under-scaling is visible and self-correcting.
    expect(vehicleClassFor(undefined)).toBe(DEFAULT_VEHICLE_CLASS);
    expect(vehicleClassFor('')).toBe(DEFAULT_VEHICLE_CLASS);
    expect(vehicleClassFor('   ')).toBe(DEFAULT_VEHICLE_CLASS);
    expect(vehicleClassFor('Sputnik')).toBe(DEFAULT_VEHICLE_CLASS);
    expect(DEFAULT_VEHICLE_CLASS).toBe('light-truck');
  });

  it('a heavy truck does not get a sports-car tachometer', () => {
    const heavy = vehicleProfileFor('Heavy rigid', 'Diesel');
    const bike = vehicleProfileFor('Motorcycle', 'Petrol');
    expect(heavy.rpm!.max).toBeLessThan(bike.rpm!.max);
    expect(heavy.speed.max).toBeLessThan(bike.speed.max);
  });

  it('heavy classes get a 24 V battery dial, light classes 12 V', () => {
    // Reading a 24 V system on a 12 V dial pins the needle permanently.
    expect(vehicleProfileFor('Heavy rigid', 'Diesel').battery.max).toBeGreaterThan(20);
    expect(vehicleProfileFor('Sedan', 'Petrol').battery.max).toBeLessThan(20);
  });

  it('an EV has NO tachometer at all, rather than a blank one', () => {
    // "Not applicable" and "unavailable" are different claims. A dead
    // dial on an EV implies a fault that does not exist.
    const ev = vehicleProfileFor('Van', 'Electric');
    expect(ev.isElectric).toBe(true);
    expect(ev.rpm).toBeUndefined();
  });

  it('a hybrid keeps its tachometer -- it has a combustion engine', () => {
    const hybrid = vehicleProfileFor('Sedan', 'Hybrid');
    expect(hybrid.isElectric).toBe(false);
    expect(hybrid.rpm).toBeDefined();
  });

  it('a trailer has no engine speed either', () => {
    expect(vehicleProfileFor('Trailer', 'Diesel').rpm).toBeUndefined();
  });

  it('recognises the electric drivetrain spellings the platform allows', () => {
    expect(isElectricDrivetrain('Electric')).toBe(true);
    expect(isElectricDrivetrain('electric')).toBe(true);
    expect(isElectricDrivetrain('EV')).toBe(true);
    expect(isElectricDrivetrain('Diesel')).toBe(false);
    expect(isElectricDrivetrain('Hybrid')).toBe(false);
    expect(isElectricDrivetrain(undefined)).toBe(false);
  });

  it('every class produces a complete, non-degenerate profile', () => {
    const classes: VehicleClass[] = [
      'motorcycle', 'light-vehicle', 'van', 'light-truck', 'heavy-truck', 'bus', 'plant', 'trailer',
    ];
    for (const vehicleClass of classes) {
      const profile = vehicleProfileFor(vehicleClass, 'Diesel');
      expect(profile.label.length).toBeGreaterThan(0);
      for (const range of [profile.speed, profile.coolant, profile.fuel, profile.battery]) {
        expect(range.max).toBeGreaterThan(range.min);
      }
    }
  });
});

describe('bandFor never calls an absent reading healthy', () => {
  const FUEL = { min: 0, max: 100, warnBelow: 20, dangerBelow: 10 };

  it('maps a missing value to unknown, NOT to normal', () => {
    // This is the function every gauge takes its colour from. If the
    // distinction fails here it fails everywhere.
    expect(bandFor(null, FUEL)).toBe('unknown');
    expect(bandFor(undefined, FUEL)).toBe('unknown');
    expect(bandFor(NaN, FUEL)).toBe('unknown');
  });

  it('bands a real value correctly, including a genuine empty tank', () => {
    expect(bandFor(80, FUEL)).toBe('normal');
    expect(bandFor(20, FUEL)).toBe('warning');
    expect(bandFor(15, FUEL)).toBe('warning');
    expect(bandFor(10, FUEL)).toBe('danger');
    expect(bandFor(0, FUEL)).toBe('danger');
  });

  it('danger wins over warning where the bands overlap', () => {
    const coolant = { min: 40, max: 130, warnAbove: 105, dangerAbove: 115 };
    expect(bandFor(110, coolant)).toBe('warning');
    expect(bandFor(120, coolant)).toBe('danger');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────
describe('gauge geometry', () => {
  it('places 12 o clock above the centre, in SVG coordinates', () => {
    // SVG's y grows downward and its 0 degrees faces east. Getting this
    // wrong once per component is how a cluster ends up with one
    // mirrored dial.
    const top = polarToCartesian(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100, 5);
    expect(top.y).toBeCloseTo(50, 5);

    const right = polarToCartesian(100, 100, 50, 90);
    expect(right.x).toBeCloseTo(150, 5);
    expect(right.y).toBeCloseTo(100, 5);

    const bottom = polarToCartesian(100, 100, 50, 180);
    expect(bottom.y).toBeCloseTo(150, 5);
  });

  it('maps min and max to the ends of the sweep', () => {
    expect(valueToAngle(0, 0, 100, GEOMETRY)).toBeCloseTo(GEOMETRY.startAngle, 5);
    expect(valueToAngle(100, 0, 100, GEOMETRY)).toBeCloseTo(GEOMETRY.endAngle, 5);
    expect(valueToAngle(50, 0, 100, GEOMETRY)).toBeCloseTo(
      (GEOMETRY.startAngle + GEOMETRY.endAngle) / 2,
      5
    );
  });

  it('CLAMPS an out-of-range reading instead of swinging past the stop', () => {
    // A needle past its stop looks like a broken instrument rather than
    // a bad reading — and this is what makes a gauge safe to point at
    // an unvalidated provider field.
    expect(valueToAngle(-50, 0, 100, GEOMETRY)).toBeCloseTo(GEOMETRY.startAngle, 5);
    expect(valueToAngle(9999, 0, 100, GEOMETRY)).toBeCloseTo(GEOMETRY.endAngle, 5);
  });

  it('survives a degenerate range without dividing by zero', () => {
    expect(Number.isFinite(valueToAngle(5, 10, 10, GEOMETRY))).toBe(true);
  });

  it('sets the large-arc flag from the actual sweep', () => {
    // Hard-coding it either way renders some arcs as their complement.
    // Path shape: "M x y A r r 0 <largeArcFlag> <sweepFlag> x y"
    const largeArcFlagOf = (path: string) => path.split(' ')[7];
    const sweepFlagOf = (path: string) => path.split(' ')[8];

    expect(largeArcFlagOf(arcPath(100, 100, 80, 225, 495))).toBe('1');
    expect(largeArcFlagOf(arcPath(100, 100, 80, 225, 260))).toBe('0');
    // Every dial here sweeps clockwise.
    expect(sweepFlagOf(arcPath(100, 100, 80, 225, 495))).toBe('1');
  });

  it('builds labelled major ticks at the interval asked for', () => {
    const ticks = buildTicks(GEOMETRY, 0, 100, { majorEvery: 20, minorPerMajor: 2 });
    const majors = ticks.filter((t) => t.major).map((t) => t.value);
    expect(majors).toEqual([0, 20, 40, 60, 80, 100]);
    expect(ticks.length).toBeGreaterThan(majors.length);
  });

  it('classifies major ticks correctly on a non-integer step', () => {
    // A modulo test on the raw value misclassifies these, because
    // 0.1 + 0.2 !== 0.3.
    const ticks = buildTicks(GEOMETRY, 0, 10, { majorEvery: 2.5, minorPerMajor: 3 });
    expect(ticks.filter((t) => t.major).map((t) => t.value)).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it('never places a tick past the end of the dial', () => {
    const ticks = buildTicks(GEOMETRY, 0, 7, { majorEvery: 3, minorPerMajor: 4 });
    for (const tick of ticks) {
      expect(tick.value).toBeLessThanOrEqual(7 + 1e-9);
      expect(tick.angle).toBeLessThanOrEqual(GEOMETRY.endAngle + 1e-6);
    }
  });

  it('returns no ticks for a degenerate dial rather than looping forever', () => {
    expect(buildTicks(GEOMETRY, 5, 5, { majorEvery: 1 })).toEqual([]);
    expect(buildTicks(GEOMETRY, 0, 10, { majorEvery: 0 })).toEqual([]);
  });

  it('clips a warning band to the dial and drops an empty one', () => {
    const clipped = bandPath(GEOMETRY, 0, 100, 80, 250);
    expect(clipped).not.toBeNull();
    expect(clipped!.to).toBe(100);

    // Entirely outside, and zero-width: both render nothing rather than
    // a dot at the arc origin.
    expect(bandPath(GEOMETRY, 0, 100, 150, 200)).toBeNull();
    expect(bandPath(GEOMETRY, 0, 100, 50, 50)).toBeNull();
  });

  it('draws a needle with a direction, not a symmetric line', () => {
    const path = needlePath(GEOMETRY, 225);
    // Tip, two shoulders and a counterweight tail: four points closed.
    expect(path.startsWith('M ')).toBe(true);
    expect(path.trim().endsWith('Z')).toBe(true);
    expect(path.match(/L /g)).toHaveLength(3);
  });
});

describe('needle motion lags the data and never leads it', () => {
  it('approaches the target without overshooting', () => {
    // The same line marker-interpolation.ts draws: smoothing toward a
    // received value is honest; predicting the next one is not.
    let current = 0;
    for (let i = 0; i < 200; i++) current = approachValue(current, 100, 16.7);
    expect(current).toBe(100);

    current = 0;
    const steps: number[] = [];
    for (let i = 0; i < 20; i++) {
      current = approachValue(current, 100, 16.7);
      steps.push(current);
    }
    for (const step of steps) {
      expect(step).toBeLessThanOrEqual(100);
      expect(step).toBeGreaterThanOrEqual(0);
    }
  });

  it('is monotonic toward the target -- no oscillation', () => {
    // A needle that wobbles past a value and settles back implies the
    // reading itself oscillated.
    let current = 100;
    let previous = Infinity;
    for (let i = 0; i < 50; i++) {
      current = approachValue(current, 0, 16.7);
      expect(current).toBeLessThan(previous);
      previous = current;
    }
  });

  it('moves the same distance per unit of TIME, not per frame', () => {
    // Otherwise the cluster animates at double speed on a 144 Hz display.
    const oneBigStep = approachValue(0, 100, 100);
    let manySmall = 0;
    for (let i = 0; i < 6; i++) manySmall = approachValue(manySmall, 100, 100 / 6);
    expect(Math.abs(oneBigStep - manySmall)).toBeLessThan(0.5);
  });

  it('jumps straight to the target from a non-finite start', () => {
    expect(approachValue(NaN, 42, 16.7)).toBe(42);
  });

  it('does not move on a zero or negative frame delta', () => {
    expect(approachValue(10, 90, 0)).toBe(10);
    expect(approachValue(10, 90, -5)).toBe(10);
  });
});
