// tests/security/fabricated-metrics.spec.ts
//
// "Never fabricate analytics" as an executable rule, for the two places
// this product was breaking it in the customer's live data.
//
// ---------------------------------------------------------------------
// WHAT WAS HAPPENING
// ---------------------------------------------------------------------
// 1. FleetHealthService.calculateMetrics computed
//
//        fuelEfficiencyAverage: totalFuel > 0 ? totalMileage / totalFuel : 0
//
//    where totalMileage comes from TRIPS. tbltrips is empty in this
//    deployment -- partly because CreateTripHandler rejected every trip
//    that named a driver (see its own note) -- while 40 fuel logs
//    exist. So the fleet's efficiency was reported as exactly 0.0 km/L.
//
//    generateRecommendations then tests `fuelEfficiencyAverage < 8`,
//    which 0 passes, and persisted an attention item reading "Improve
//    fleet fuel efficiency -- Current fuel efficiency (0.0 km/L) is
//    below optimal", carrying a $1,000 estimated cost and a $5,000
//    estimated benefit. Both numbers were invented from the ABSENCE of
//    data. The same 0.0 was printed into the ESG disclosure PDF.
//
// 2. FuelFraudDetectionService.calculateBaseline computed distance by
//    SUMMING odometer readings. An odometer is cumulative, so ten
//    readings from a truck at ~84,000 km summed to ~840,000 "km".
//
// Both are the same error: a value that could not be measured was
// given a number instead of an absence, and the number then flowed into
// something a customer reads and acts on.
//
// These tests exercise the private calculators through the public
// class rather than mocking a database, because the property is
// arithmetic.

import { FleetHealthService } from '../../modules/ai/services/fleet-health.service';
import { FuelFraudDetectionService } from '../../modules/ai/services/fuel-fraud-detection.service';

/** Reaches a private method without loosening the class's own typing. */
function callPrivate<T>(instance: object, method: string, ...args: unknown[]): T {
  return (instance as unknown as Record<string, (...a: unknown[]) => T>)[method](...args);
}

type Metrics = {
  fuelEfficiencyAverage: number | null;
  averageMileage: number;
};

const vehicle = { _id: 'v1', license_plate: 'AFK5777', year: 2020 };

describe('FleetHealthService: fuel efficiency is never fabricated', () => {
  const service = new FleetHealthService();

  // calculateFleetMetrics(vehicles, maintenance, trips, fuel)
  const metricsFor = (trips: unknown[], fuel: unknown[]): Metrics =>
    callPrivate<Metrics>(service, 'calculateFleetMetrics', [vehicle], [], trips, fuel);

  it('REGRESSION: fuel logged but no trips reports null, not 0.0 km/L', () => {
    // Exactly the customer's situation: 40 fuel logs, 0 trips.
    const metrics = metricsFor([], [{ fuel_volume: 220 }, { fuel_volume: 100 }]);
    expect(metrics.fuelEfficiencyAverage).toBeNull();
  });

  it('reports null when there is no fuel either', () => {
    expect(metricsFor([], []).fuelEfficiencyAverage).toBeNull();
  });

  it('reports a real figure when both distance and fuel exist', () => {
    const metrics = metricsFor(
      [{ distance_calculated: 800 }, { distance_calculated: 200 }],
      [{ fuel_volume: 100 }]
    );
    expect(metrics.fuelEfficiencyAverage).toBeCloseTo(10);
  });

  it('REGRESSION: raises no efficiency recommendation when efficiency is unmeasured', () => {
    // The $5,000 "opportunity" invented from missing data. `null < 8` is
    // already false in JS, but the guard is explicit so a refactor that
    // coalesces null to 0 fails here rather than in a customer's
    // Command Centre.
    // generateRecommendations(vehicles, maintenance, vehicleScores, metrics)
    const recommendations = callPrivate<Array<{ title: string }>>(
      service,
      'generateRecommendations',
      [vehicle],
      [],
      [],
      { ...metricsFor([], [{ fuel_volume: 220 }]), overdueMaintenanceCount: 0 }
    );
    expect(recommendations.map((r) => r.title)).not.toContain('Improve fleet fuel efficiency');
  });

  it('still raises the recommendation for a genuinely poor measured figure', () => {
    // The guard must not suppress the real finding it exists to allow.
    const metrics = {
      ...metricsFor([{ distance_calculated: 100 }], [{ fuel_volume: 50 }]),
      overdueMaintenanceCount: 0,
    };
    expect(metrics.fuelEfficiencyAverage).toBeCloseTo(2);

    const recommendations = callPrivate<Array<{ title: string }>>(
      service,
      'generateRecommendations',
      [vehicle],
      [],
      [],
      metrics
    );
    expect(recommendations.map((r) => r.title)).toContain('Improve fleet fuel efficiency');
  });
});

describe('FleetHealthService.calculateFuelScore: units and missing data', () => {
  const service = new FleetHealthService();
  const score = (fuel: unknown[]) => callPrivate<number>(service, 'calculateFuelScore', fuel);

  it('REGRESSION: no odometer data scores NEUTRAL, not perfect', () => {
    // Was 100/100 -- `Math.max(1, 0 || 1)` made the denominator 1, so a
    // 220 L fill produced a ratio of 22, clamped to 1.
    expect(score([{ fuel_volume: 220, odometer: 0 }, { fuel_volume: 100, odometer: 0 }])).toBe(50);
  });

  it('REGRESSION: better economy scores higher than worse economy', () => {
    // The units were inverted (L/km compared against a km/L benchmark),
    // so this ordering used to be reversed.
    const good = score([
      { fuel_volume: 50, odometer: 1_000 },
      { fuel_volume: 50, odometer: 2_000 }, // 1000 km on 100 L = 10 km/L
    ]);
    const poor = score([
      { fuel_volume: 50, odometer: 1_000 },
      { fuel_volume: 50, odometer: 1_100 }, // 100 km on 100 L = 1 km/L
    ]);
    expect(good).toBeGreaterThan(poor);
    expect(good).toBe(100);
  });

  it('scores neutral with a single reading (no interval to measure)', () => {
    expect(score([{ fuel_volume: 100, odometer: 84_300 }])).toBe(50);
  });

  it('scores neutral with no fuel logs at all', () => {
    expect(score([])).toBe(50);
  });
});

describe('FuelFraudDetectionService: distance is a difference, not a sum', () => {
  const service = new FuelFraudDetectionService();

  const baselineFor = (logs: unknown[]) =>
    callPrivate<{ efficiency: number | null; averageFrequency: number | null }>(
      service,
      'calculateBaseline',
      logs,
      vehicle
    );

  it('REGRESSION: does not sum cumulative odometer readings', () => {
    // Summing these gives 253,500 "km" on 300 L -- about 845 km/L.
    // The real distance covered is 84,700 - 84,300 = 400 km on 300 L.
    const baseline = baselineFor([
      { fuel_volume: 100, cost: 200, odometer: 84_300 },
      { fuel_volume: 100, cost: 200, odometer: 84_500 },
      { fuel_volume: 100, cost: 200, odometer: 84_700 },
    ]);
    expect(baseline.efficiency).toBeCloseTo(400 / 300);
  });

  it('REGRESSION: odometer 0 means "not recorded", not kilometre zero', () => {
    // Real tblfuellogs rows in this deployment carry odometer: 0.
    // Treating 0 as the minimum would make every distance equal the
    // vehicle's lifetime mileage.
    const baseline = baselineFor([
      { fuel_volume: 100, cost: 200, odometer: 0 },
      { fuel_volume: 100, cost: 200, odometer: 84_500 },
    ]);
    expect(baseline.efficiency).toBeNull();
  });

  it('reports null rather than 0 when every reading is missing', () => {
    const baseline = baselineFor([
      { fuel_volume: 220, cost: 429, odometer: 0 },
      { fuel_volume: 100, cost: 195, odometer: 0 },
    ]);
    expect(baseline.efficiency).toBeNull();
    expect(baseline.averageFrequency).toBeNull();
  });

  it('reports null with only one usable reading (no interval to measure)', () => {
    const baseline = baselineFor([{ fuel_volume: 100, cost: 200, odometer: 84_300 }]);
    expect(baseline.efficiency).toBeNull();
  });

  it('reports null when the odometer did not advance', () => {
    const baseline = baselineFor([
      { fuel_volume: 100, cost: 200, odometer: 84_300 },
      { fuel_volume: 100, cost: 200, odometer: 84_300 },
    ]);
    expect(baseline.efficiency).toBeNull();
  });

  it('still computes volume statistics, which need no distance', () => {
    // The guard must not disable the parts of the model that work
    // without an odometer -- volume-anomaly detection is the primary
    // fraud signal and does not depend on distance at all.
    const baseline = baselineFor([
      { fuel_volume: 100, cost: 200, odometer: 0 },
      { fuel_volume: 300, cost: 600, odometer: 0 },
    ]);
    expect(baseline.efficiency).toBeNull();
    expect(
      callPrivate<{ averageVolume: number; standardDeviation: number }>(
        service,
        'calculateBaseline',
        [
          { fuel_volume: 100, cost: 200, odometer: 0 },
          { fuel_volume: 300, cost: 600, odometer: 0 },
        ],
        vehicle
      ).averageVolume
    ).toBe(200);
  });
});
