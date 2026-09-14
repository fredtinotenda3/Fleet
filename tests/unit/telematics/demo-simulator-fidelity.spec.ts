// tests/unit/telematics/demo-simulator-fidelity.spec.ts
//
// ---------------------------------------------------------------------
// THE SIMULATOR IS A PROVIDER, AND IS HELD TO A PROVIDER'S STANDARD
// ---------------------------------------------------------------------
// Demo Mode persists through the SAME `tbltelematics` collection that
// real Cartrack and Eagle Track readings land in. Nothing downstream --
// not the live map, not trip generation, not the cost pipeline -- can
// tell a demo reading from a measured one except by its `deviceId`
// prefix. That makes every fabricated value in the demo path a
// fabricated value in the product.
//
// Three defects were found in that path and are pinned here:
//
//   1. `ignitionOn: !isIdleWindow` -- the simulator reported an IDLING
//      vehicle as ignition-off, contradicting the definition of idle
//      used everywhere else in this codebase (engine running while
//      stationary). Invisible until ignition became a persisted field.
//
//   2. Hard-coded engine constants (`coolantTemp: 90`, `rpm: 1800/800`,
//      `throttlePosition: 40/0`, `engineLoad: 50/5`) written as if
//      measured.
//
//   3. `averageSpeed: sim.speed, maxSpeed: sim.speed` -- an instant-
//      aneous sample presented as two trip aggregates. This is the SAME
//      category error both real adapters carry long comments about
//      having fixed; the fix never reached the demo path.
//
// The tests below are behavioural where the behaviour is observable and
// structural only where the defect was the absence of a field.

import {
  simulateVehicleState,
  DEFAULT_DEMO_DEPOT,
} from '../../../modules/telematics/demo/demo-simulator.service';

const VEHICLE = 'vehicle-afu0078';

/** Samples one vehicle across a whole loop, one reading per 15s. */
function sampleLoop(vehicleId: string, seconds = 1800, step = 15) {
  const out = [];
  for (let t = 0; t <= seconds; t += step) {
    out.push({ t, ...simulateVehicleState(vehicleId, t) });
  }
  return out;
}

describe('the design rule: a pure function of (vehicleId, elapsedSeconds)', () => {
  it('is deterministic -- the same inputs give byte-identical output', () => {
    // Load-bearing: the service is called from serverless instances with
    // no shared state, and route history must be coherent when replayed.
    expect(simulateVehicleState(VEHICLE, 617)).toEqual(simulateVehicleState(VEHICLE, 617));
  });

  it('spreads distinct vehicles across the parameter space', () => {
    const a = simulateVehicleState('vehicle-a', 300);
    const b = simulateVehicleState('vehicle-b', 300);
    expect(a.lat).not.toBeCloseTo(b.lat, 4);
    expect(a.rpm === b.rpm && a.odometerKm === b.odometerKm).toBe(false);
  });

  it('uses no randomness', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../modules/telematics/demo/demo-simulator.service.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/Math\.random/);
  });
});

describe('REGRESSION: idle means engine running while stationary', () => {
  /*
    Every other part of the codebase agrees on this definition --
    canonical-telemetry.ts, eagletrack-triggers.map.ts, and both
    adapters' `ignition_on && speed === 0`. The simulator disagreed with
    all of them, and the disagreement only became reachable once
    `TelematicsData.engine.ignition` existed to carry it.
  */
  it('reports ignition ON during an idle window, not off', () => {
    const samples = sampleLoop(VEHICLE);
    const idling = samples.filter((s) => s.status === 'idle');

    expect(idling.length).toBeGreaterThan(0);
    for (const sample of idling) {
      expect({ t: sample.t, status: sample.status, ignitionOn: sample.ignitionOn }).toEqual({
        t: sample.t,
        status: 'idle',
        ignitionOn: true,
      });
    }
  });

  it('an idle sample is stationary, which is the other half of the definition', () => {
    for (const sample of sampleLoop(VEHICLE).filter((s) => s.status === 'idle')) {
      expect({ t: sample.t, speed: sample.speed }).toEqual({ t: sample.t, speed: 0 });
    }
  });

  it('never reports a moving vehicle with the engine off', () => {
    for (const sample of sampleLoop(VEHICLE)) {
      if (sample.speed > 0) {
        expect({ t: sample.t, ignitionOn: sample.ignitionOn }).toEqual({
          t: sample.t,
          ignitionOn: true,
        });
      }
    }
  });
});

describe('engine signals are modelled, not constant', () => {
  it('coolant climbs from ambient and plateaus at operating temperature', () => {
    // §5.2's requirement, and the shape a thermostat actually produces:
    // fast at first, asymptotic after. The old value was the literal 90.
    const cold = simulateVehicleState(VEHICLE, 0).coolantTemp;
    const warming = simulateVehicleState(VEHICLE, 60).coolantTemp;
    const warm = simulateVehicleState(VEHICLE, 400).coolantTemp;
    const later = simulateVehicleState(VEHICLE, 3600).coolantTemp;

    expect(cold).toBeLessThan(30);
    expect(warming).toBeGreaterThan(cold);
    expect(warm).toBeGreaterThan(warming);
    expect(warm).toBeGreaterThan(80);
    expect(warm).toBeLessThanOrEqual(90);

    // Plateau, not a ramp that keeps climbing into an overheat.
    expect(Math.abs(later - warm)).toBeLessThan(1);
  });

  it('the warm-up is monotonic -- coolant never falls while the engine runs', () => {
    const samples = sampleLoop(VEHICLE, 900, 30);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].coolantTemp).toBeGreaterThanOrEqual(samples[i - 1].coolantTemp - 0.05);
    }
  });

  it('RPM tracks speed and falls to a per-vehicle idle when stopped', () => {
    const samples = sampleLoop(VEHICLE);
    const stopped = samples.filter((s) => s.speed === 0);
    const moving = samples.filter((s) => s.speed > 0);

    expect(stopped.length).toBeGreaterThan(0);
    expect(moving.length).toBeGreaterThan(0);

    const idleRpms = new Set(stopped.map((s) => s.rpm));
    // One idle value for this vehicle, and it is a plausible idle.
    expect(idleRpms.size).toBe(1);
    const idleRpm = [...idleRpms][0];
    expect(idleRpm).toBeGreaterThan(600);
    expect(idleRpm).toBeLessThan(900);

    for (const sample of moving) {
      expect(sample.rpm).toBeGreaterThan(idleRpm);
      // No demo vehicle should ever show an impossible tachometer.
      expect(sample.rpm).toBeLessThan(3000);
    }
  });

  it('RPM sawtooths through gears rather than rising in one straight line', () => {
    /*
      A real tachometer drops on every upshift. A needle that climbs
      monotonically with road speed is the most obvious tell that a
      cluster is faked, so the gear model is asserted, not just the
      range: somewhere in the speed sweep, a HIGHER speed must produce a
      LOWER rpm.
    */
    const bySpeed: Array<{ speed: number; rpm: number }> = [];
    for (let t = 0; t <= 3600; t += 5) {
      const s = simulateVehicleState(VEHICLE, t);
      if (s.speed > 0) bySpeed.push({ speed: s.speed, rpm: s.rpm });
    }
    bySpeed.sort((a, b) => a.speed - b.speed);

    const shifted = bySpeed.some((point, i) => i > 0 && point.rpm < bySpeed[i - 1].rpm);
    expect({ observedAnUpshift: shifted }).toEqual({ observedAnUpshift: true });
  });

  it('idling burns fuel -- the figure the idle metric exists to expose', () => {
    // The old path wrote `instantConsumption: 0`, which reports a
    // running engine as consuming nothing and hides the cost entirely.
    const idling = sampleLoop(VEHICLE).filter((s) => s.status === 'idle');
    expect(idling.length).toBeGreaterThan(0);
    for (const sample of idling) {
      expect(sample.instantConsumptionLph).toBeGreaterThan(0);
    }
  });

  it('burn rises with load, so cruising costs more per hour than idling', () => {
    const samples = sampleLoop(VEHICLE);
    const idleBurn = Math.max(
      ...samples.filter((s) => s.status === 'idle').map((s) => s.instantConsumptionLph)
    );
    const cruiseBurn = Math.max(
      ...samples.filter((s) => s.speed > 0).map((s) => s.instantConsumptionLph)
    );
    expect(cruiseBurn).toBeGreaterThan(idleBurn);
  });

  it('charging voltage stays in the range an alternator actually holds', () => {
    for (const sample of sampleLoop(VEHICLE)) {
      expect(sample.batteryVoltage).toBeGreaterThan(13.5);
      expect(sample.batteryVoltage).toBeLessThanOrEqual(14.4);
    }
  });

  it('throttle is closed at a standstill and open under way', () => {
    const samples = sampleLoop(VEHICLE);
    for (const sample of samples) {
      if (sample.speed === 0) {
        expect({ t: sample.t, throttle: sample.throttlePosition }).toEqual({
          t: sample.t,
          throttle: 0,
        });
      } else {
        expect(sample.throttlePosition).toBeGreaterThan(0);
        expect(sample.throttlePosition).toBeLessThanOrEqual(95);
      }
    }
  });

  it('engine hours only ever advance', () => {
    const a = simulateVehicleState(VEHICLE, 0).engineHours;
    const b = simulateVehicleState(VEHICLE, 7200).engineHours;
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeCloseTo(2, 0);
  });

  it('fuel falls monotonically between refuels and never leaves 20-100%', () => {
    const samples = sampleLoop(VEHICLE, 7200, 60);
    for (const sample of samples) {
      expect(sample.fuelLevel).toBeGreaterThanOrEqual(20);
      expect(sample.fuelLevel).toBeLessThanOrEqual(100);
    }
    // Monotonic except at the sawtooth reset.
    const rises = samples.filter((s, i) => i > 0 && s.fuelLevel > samples[i - 1].fuelLevel);
    expect(rises.length).toBeLessThanOrEqual(1);
  });

  it('speed and heading remain the true derivatives of the path', () => {
    // The property the original file was built around; the engine model
    // must not have disturbed it.
    const dt = 1;
    const a = simulateVehicleState(VEHICLE, 600);
    const b = simulateVehicleState(VEHICLE, 600 + dt);

    const dLat = (b.lat - a.lat) * 111.32;
    const dLng = (b.lng - a.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
    const observedKmh = Math.hypot(dLat, dLng) * 3600;

    // Within a sensible tolerance of the reported instantaneous speed.
    expect(Math.abs(observedKmh - a.speed)).toBeLessThan(Math.max(5, a.speed * 0.25));
  });

  it('stays near the configured depot', () => {
    const s = simulateVehicleState(VEHICLE, 900);
    expect(Math.abs(s.lat - DEFAULT_DEMO_DEPOT.lat)).toBeLessThan(0.5);
    expect(Math.abs(s.lng - DEFAULT_DEMO_DEPOT.lng)).toBeLessThan(0.5);
  });
});

describe('REGRESSION: the persisted demo reading invents nothing', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');

  const src = fs
    .readFileSync(
      path.resolve(__dirname, '../../../modules/telematics/services/live-map.service.ts'),
      'utf8'
    )
    // Comments quote the code they replaced.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const block = src.slice(src.indexOf('const deviceId = `demo-${vehicleId}`'));
  const payload = block.slice(0, block.indexOf('await telematicsService.ingestTelematicsData'));

  it('no longer presents an instantaneous sample as a trip aggregate', () => {
    // The exact defect both real adapters were corrected for.
    expect(payload).not.toMatch(/averageSpeed:\s*sim\.speed/);
    expect(payload).not.toMatch(/maxSpeed:\s*sim\.speed/);
  });

  it('no longer writes hard-coded engine constants', () => {
    expect(payload).not.toMatch(/coolantTemp:\s*\d/);
    expect(payload).not.toMatch(/rpm:\s*sim\.status/);
    expect(payload).not.toMatch(/engineLoad:\s*sim\.status/);
    expect(payload).not.toMatch(/throttlePosition:\s*sim\.status/);
  });

  it('no longer writes fabricated zeros for fuel flow', () => {
    expect(payload).not.toMatch(/consumptionRate:\s*0/);
    expect(payload).not.toMatch(/fuelUsed:\s*0/);
    expect(payload).not.toMatch(/tripDistance:\s*0/);
    expect(payload).not.toMatch(/tripDuration:\s*0/);
  });

  it('carries the modelled signals through', () => {
    expect(payload).toMatch(/ignition:\s*sim\.ignitionOn/);
    expect(payload).toMatch(/rpm:\s*sim\.rpm/);
    expect(payload).toMatch(/coolantTemp:\s*sim\.coolantTemp/);
    expect(payload).toMatch(/instantConsumption:\s*sim\.instantConsumptionLph/);
  });
});
