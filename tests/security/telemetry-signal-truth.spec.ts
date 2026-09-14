// tests/security/telemetry-signal-truth.spec.ts
//
// ---------------------------------------------------------------------
// A SIGNAL IS EITHER MEASURED OR IT IS ABSENT
// ---------------------------------------------------------------------
// This file guards the rule that everything on the Vehicle Operational
// Hub depends on: a value the platform did not receive must not reach a
// screen as a number. It sits in tests/security rather than tests/unit
// because the failure mode is the same class as a scope leak — the
// product asserting something it does not know, in a form the operator
// cannot detect by looking.
//
// A gauge raises the stakes over a table cell. A needle resting at the
// bottom of its dial and a needle with no signal are the same picture,
// and "0 rpm" reads as a stalled engine rather than as silence.
//
// Three defects are pinned here, each of which reached the product:
//
//   1. IGNITION WAS DISCARDED AT INGEST. Both adapters read it from
//      their provider, used it once to derive idle time, and threw the
//      boolean away because `TelematicsData` had no field for it. After
//      ingest, "engine running while stationary" and "parked" were the
//      same observation — which is the distinction the idle metric IS.
//
//   2. THE DEMO PROVIDER FABRICATED ENGINE VALUES. Constants and zeros
//      written into the same collection real Cartrack readings land in,
//      including the exact `averageSpeed: speed` category error both
//      real adapters carry long comments about having fixed.
//
//   3. NOTHING ENFORCED THE RULE AT THE RENDER LAYER. Nullable backend
//      fields plus a convention, re-fixed several times because a render
//      site is easy to forget. The `Signal` type makes it structural.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const readRaw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (rel: string) => stripComments(readRaw(rel));

describe('ignition survives the whole pipeline', () => {
  it('the persisted model has a field for it', () => {
    // The absence of this field is what forced both adapters to discard
    // the signal and forced trip generation to dig through the metadata
    // bag for it.
    expect(read('modules/telematics/types/telematics.types.ts')).toMatch(/ignition\?: boolean;/);
  });

  it('both adapters persist it instead of only deriving idle time from it', () => {
    const eagle = read('modules/telematics/adapters/eagletrack/eagletrack.adapter.ts');
    expect(eagle).toMatch(/engine\.ignition = ignitionOn/);

    const cartrack = read('modules/telematics/adapters/cartrack/cartrack.adapter.ts');
    expect(cartrack).toMatch(/ignition: status\.ignition_on/);
  });

  it('EagleTrack keeps ABSENT distinct from OFF', () => {
    /*
      `pickBooleanIo` returns null for "not reported". Writing that as
      `false` would render every tracker without an ignition wire as
      engine-off — a claim the data does not support, and one that would
      make the idle metric silently wrong rather than absent.
    */
    const eagle = read('modules/telematics/adapters/eagletrack/eagletrack.adapter.ts');
    expect(eagle).toMatch(/typeof ignitionOn === 'boolean'/);
  });

  it('the live-map detail carries it, using the trips module extractor', () => {
    // Re-deriving the lookup here would be a third copy of one rule.
    const service = read('modules/telematics/services/live-map.service.ts');
    expect(service).toMatch(/ignition: extractIgnition\(latest\)/);
    expect(service).toMatch(/import \{ extractIgnition \}/);

    expect(read('modules/telematics/types/live-map.types.ts')).toMatch(/ignition\?: boolean;/);
  });

  it('the extractor still treats "not reported" as undefined, not false', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { extractIgnition } = require('../../modules/trips/services/trip-generation.service');

    expect(extractIgnition({ timestamp: new Date(), engine: { ignition: true } })).toBe(true);
    expect(extractIgnition({ timestamp: new Date(), engine: { ignition: false } })).toBe(false);
    // Returning `false` here would end every trip on its first reading.
    expect(extractIgnition({ timestamp: new Date() })).toBeUndefined();
    expect(extractIgnition({ timestamp: new Date(), engine: {} })).toBeUndefined();
    // Eagle Track's raw integer form.
    expect(extractIgnition({ timestamp: new Date(), providerMetadata: { ignition: 1 } })).toBe(true);
    expect(extractIgnition({ timestamp: new Date(), providerMetadata: { ignition: 0 } })).toBe(false);
  });
});

describe('the demo provider is held to a real provider standard', () => {
  const src = read('modules/telematics/services/live-map.service.ts');
  const block = src.slice(src.indexOf('const deviceId = `demo-${vehicleId}`'));
  const payload = block.slice(0, block.indexOf('await telematicsService.ingestTelematicsData'));

  it('writes no hard-coded engine constants', () => {
    // `coolantTemp: 90` is not a simulation of anything; it is the
    // number 90, and a gauge built on it has a needle that never moves.
    expect(payload).not.toMatch(/coolantTemp:\s*\d/);
    expect(payload).not.toMatch(/rpm:\s*\d/);
    expect(payload).not.toMatch(/engineLoad:\s*\d/);
    expect(payload).not.toMatch(/altitude:\s*\d/);
    expect(payload).not.toMatch(/accuracy:\s*\d/);
  });

  it('writes no fabricated zeros', () => {
    expect(payload).not.toMatch(/consumptionRate:\s*0/);
    expect(payload).not.toMatch(/fuelUsed:\s*0/);
    expect(payload).not.toMatch(/tripDistance:\s*0/);
    expect(payload).not.toMatch(/tripDuration:\s*0/);
  });

  it('does not repeat the aggregate error the real adapters were fixed for', () => {
    expect(payload).not.toMatch(/averageSpeed:/);
    expect(payload).not.toMatch(/maxSpeed:/);
  });

  it('the real adapters still omit those aggregates too', () => {
    // The premise: if either adapter regains them, this rule stops
    // meaning what it says.
    for (const rel of [
      'modules/telematics/adapters/cartrack/cartrack.adapter.ts',
      'modules/telematics/adapters/eagletrack/eagletrack.adapter.ts',
    ]) {
      const adapter = read(rel);
      expect({ file: rel, avg: /averageSpeed:\s*speed/.test(adapter) }).toEqual({
        file: rel,
        avg: false,
      });
    }
  });
});

describe('the render layer cannot skip the provenance question', () => {
  it('the gauge takes a Signal, never a bare number', () => {
    /*
      This is the structural half of the rule. A component that accepts
      `value: number | null` relies on each render site remembering to
      branch; one that accepts a `Signal` has no `.value` to reach for
      on the unavailable variant, so it cannot compile without branching.
    */
    const gauge = read('frontend/shared/ui/instruments/Gauge.tsx');
    expect(gauge).toMatch(/signal: Signal<number>/);
    expect(gauge).not.toMatch(/value: number \| null/);
  });

  it('an unavailable signal draws NO needle', () => {
    // A needle at the minimum is a reading of the minimum.
    const gauge = read('frontend/shared/ui/instruments/Gauge.tsx');
    expect(gauge).toMatch(/\{!unavailable && \(/);
  });

  it('the cluster lifts every telemetry field through fromReading', () => {
    // `fromReading` is the single place null/undefined/NaN becomes
    // UNAVAILABLE. A field read directly would bypass it.
    const cluster = read(
      'frontend/modules/vehicles/components/operations/VehicleInstrumentCluster.tsx'
    );
    const reads = cluster.match(/fromReading\(/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(5);
    // No `?? 0` anywhere near a telemetry read.
    expect(cluster).not.toMatch(/engine\?\.\w+ \?\? 0/);
    expect(cluster).not.toMatch(/speed \?\? 0/);
  });

  it('only a live fix animates', () => {
    // Motion is a claim of liveness. Animating a frozen reading is the
    // product asserting something it does not know.
    const cluster = read(
      'frontend/modules/vehicles/components/operations/VehicleInstrumentCluster.tsx'
    );
    expect(cluster).toMatch(/const animate = copy\.animate/);

    const signals = read('frontend/shared/ui/instruments/signal-state.ts');
    // Exactly one branch grants animation.
    expect((signals.match(/animate: true/g) ?? []).length).toBe(1);
  });

  it('an electric drivetrain gets NOT-APPLICABLE, not a dead dial', () => {
    const cluster = read(
      'frontend/modules/vehicles/components/operations/VehicleInstrumentCluster.tsx'
    );
    expect(cluster).toMatch(/profile\.isElectric[\s\S]{0,120}notApplicable/);

    const profile = read('frontend/modules/vehicles/utils/vehicle-profile.ts');
    // The range is removed entirely rather than left blank.
    expect(profile).toMatch(/rpm: _omitted/);
  });

  it('a failed telemetry request is not rendered as a silent vehicle', () => {
    // "This vehicle reports nothing" is a claim about the customer's
    // hardware; a failed request does not support it.
    const cluster = read(
      'frontend/modules/vehicles/components/operations/VehicleInstrumentCluster.tsx'
    );
    expect(cluster).toMatch(/if \(isError\)/);
    expect(cluster).toMatch(/not a report[\s\S]{0,60}silent/i);
  });
});

describe('the hub shows live state and uses what it already knows', () => {
  const page = read('frontend/modules/vehicles/pages/VehicleDetailPage.tsx');

  it('mounts the instrument cluster', () => {
    // The hub previously imported nothing from telematics at all: a page
    // about one vehicle that could not say where it was.
    expect(page).toMatch(/<VehicleInstrumentCluster/);
  });

  it('is vehicle-scoped, never fleet-wide', () => {
    /*
      The live-map page's pattern is `useLiveMap()` then `.find()`. On a
      single-vehicle screen that pulls every vehicle's telemetry to
      render one — what §12.3 rules out.
    */
    const cluster = read(
      'frontend/modules/vehicles/components/operations/VehicleInstrumentCluster.tsx'
    );
    expect(cluster).toMatch(/useVehicleDetail\(vehicleId\)/);
    expect(cluster).not.toMatch(/useLiveMap\(/);
  });

  it('passes the assigned driver it already holds into the action forms', () => {
    // `vehicle.assignedDriver` was fetched and rendered in the Driver
    // tab while every form opened from the same page started empty.
    expect(page).toMatch(/currentDriverId=\{vehicle\.assignedDriver\?\._id/);
  });

  it('seeding a driver applies to a NEW record only', () => {
    /*
      The fuel-driver fix turns on this: the chart must attribute a log
      to the driver ON THE LOG, never to the vehicle's current driver.
      Seeding a create form is a convenience; rewriting an existing
      log's attribution would undo that fix.
    */
    const modal = read('frontend/modules/fuel/components/FuelModal.tsx');
    expect(modal).toMatch(/if \(!log\) \{/);
    // The edit path returns the log's own driver, untouched.
    expect(modal).toMatch(/driver_id: log\.driver_id/);
  });

  it('the vehicle auto-fill rule runs on BOTH the manual and pre-filled paths', () => {
    /*
      It used to live inside `onValueChange`, so it fired only when the
      operator picked a vehicle by hand -- and never on the one path
      where the vehicle is unambiguously known, because a default value
      raises no change event.
    */
    const form = read('frontend/modules/fuel/components/FuelForm.tsx');
    expect(form).toMatch(/const applyVehicleDefaults = useCallback/);
    expect(form).toMatch(/useEffect\([\s\S]{0,200}applyVehicleDefaults\(prefilledPlate\)/);
    expect(form).toMatch(/onValueChange[\s\S]{0,200}applyVehicleDefaults\(plate\)/);
  });

  it('auto-fill never overwrites what the operator typed', () => {
    const form = read('frontend/modules/fuel/components/FuelForm.tsx');
    expect(form).toMatch(/!currentOdometer \|\| currentOdometer === 0/);
    expect(form).toMatch(/shouldDirty: false/);
  });
});
