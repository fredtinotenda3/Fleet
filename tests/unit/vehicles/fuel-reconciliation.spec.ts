// tests/unit/vehicles/fuel-reconciliation.spec.ts
//
// WAVE 1 PART 2, item 4: fuel/trip reconciliation.
//
// This is the data-truth core of a financial feature, so the assertions
// here are about what the module REFUSES to compute as much as what it
// computes -- an electric vehicle, a thin baseline, an ambiguous zero
// distance, and a period with no fuel purchased all have to come out as
// honest UNAVAILABLE/NOT-APPLICABLE states rather than a plausible-looking
// number. Pure function, no mocking needed.

import {
  computeFuelReconciliation,
  baselineWindowFor,
  hasFuelValue,
  fuelValueOf,
  fuelProvenanceLabel,
  fuelProvenanceExplanation,
  MIN_BASELINE_LOG_COUNT,
  BASELINE_WINDOW_DAYS,
  type FuelReconciliationInput,
  type FuelValue,
} from '../../../frontend/modules/vehicles/utils/fuel-reconciliation';

const PLATE = 'HRE1234';

function baseInput(overrides: Partial<FuelReconciliationInput> = {}): FuelReconciliationInput {
  return {
    licensePlate: PLATE,
    isElectric: false,
    period: {
      totalFuel: 100,
      totalCost: 250,
      logCount: 4,
      totalDistance: 900,
      fallbackPlates: [],
    },
    baseline: {
      averageFuelEfficiency: 10, // km/L
      logCount: 12,
    },
    ...overrides,
  };
}

describe('computeFuelReconciliation: electric vehicles', () => {
  it('is NOT-APPLICABLE for every field, regardless of how much fuel/distance data is present', () => {
    const result = computeFuelReconciliation(baseInput({ isElectric: true }));

    for (const field of [
      result.actualFuel,
      result.actualCost,
      result.distance,
      result.baselineEfficiency,
      result.expectedFuel,
      result.expectedCost,
      result.fuelVariance,
      result.fuelVariancePercent,
      result.costVariance,
    ] as FuelValue[]) {
      expect(field.provenance).toBe('not-applicable');
    }
    expect(result.isDefensible).toBe(false);
  });
});

describe('computeFuelReconciliation: baseline defensibility gate', () => {
  it('is UNAVAILABLE end-to-end when the baseline has fewer than MIN_BASELINE_LOG_COUNT logs', () => {
    const result = computeFuelReconciliation(
      baseInput({ baseline: { averageFuelEfficiency: 10, logCount: MIN_BASELINE_LOG_COUNT - 1 } })
    );

    expect(result.isDefensible).toBe(false);
    expect(result.baselineEfficiency.provenance).toBe('unavailable');
    expect(result.expectedFuel.provenance).toBe('unavailable');
    expect(result.expectedCost.provenance).toBe('unavailable');
    expect(result.fuelVariance.provenance).toBe('unavailable');
    expect(result.costVariance.provenance).toBe('unavailable');

    if (result.baselineEfficiency.provenance === 'unavailable') {
      expect(result.baselineEfficiency.reason).toMatch(new RegExp(String(MIN_BASELINE_LOG_COUNT)));
    }

    // Actual fuel/cost for THIS period are still known and shown --
    // one unavailable input must not blank out data we do have.
    expect(result.actualFuel.provenance).toBe('actual');
    expect(result.actualCost.provenance).toBe('actual');
  });

  it('is UNAVAILABLE when enough logs exist but efficiency could not be computed (no distance in baseline window)', () => {
    const result = computeFuelReconciliation(
      baseInput({ baseline: { averageFuelEfficiency: 0, logCount: 12 } })
    );
    expect(result.baselineEfficiency.provenance).toBe('unavailable');
    if (result.baselineEfficiency.provenance === 'unavailable') {
      expect(result.baselineEfficiency.reason).toMatch(/no odometer or trip-distance data/i);
    }
  });

  it('is defensible at exactly MIN_BASELINE_LOG_COUNT logs (boundary, not off-by-one)', () => {
    const result = computeFuelReconciliation(
      baseInput({ baseline: { averageFuelEfficiency: 10, logCount: MIN_BASELINE_LOG_COUNT } })
    );
    expect(result.isDefensible).toBe(true);
    expect(result.baselineEfficiency.provenance).toBe('calculated');
  });
});

describe('computeFuelReconciliation: the happy path end-to-end', () => {
  it('produces CALCULATED expected values and a DERIVED variance from a defensible baseline', () => {
    const result = computeFuelReconciliation(baseInput());

    expect(result.isDefensible).toBe(true);
    expect(result.actualFuel).toEqual({
      provenance: 'actual',
      value: 100,
      source: expect.stringContaining('4 fuel log'),
    });
    expect(result.distance.provenance).toBe('actual'); // odometer-based, no fallback plate
    expect(result.expectedFuel.provenance).toBe('calculated');
    if (result.expectedFuel.provenance === 'calculated') {
      // 900 km / 10 km/L = 90 L expected
      expect(result.expectedFuel.value).toBeCloseTo(90, 5);
    }

    expect(result.fuelVariance.provenance).toBe('derived');
    if (result.fuelVariance.provenance === 'derived') {
      // actual 100 L - expected 90 L = +10 L (used more than expected)
      expect(result.fuelVariance.value).toBeCloseTo(10, 5);
    }

    expect(result.fuelVariancePercent.provenance).toBe('derived');
    if (result.fuelVariancePercent.provenance === 'derived') {
      expect(result.fuelVariancePercent.value).toBeCloseTo((10 / 90) * 100, 5);
    }

    // unit cost actual = 250 / 100 = 2.5; expected cost = 90 * 2.5 = 225
    expect(result.expectedCost.provenance).toBe('calculated');
    if (result.expectedCost.provenance === 'calculated') {
      expect(result.expectedCost.value).toBeCloseTo(225, 5);
    }
    expect(result.costVariance.provenance).toBe('derived');
    if (result.costVariance.provenance === 'derived') {
      // actual 250 - expected 225 = +25
      expect(result.costVariance.value).toBeCloseTo(25, 5);
    }
  });

  it('marks distance ESTIMATED (not ACTUAL) when the trip-distance fallback was used for this plate', () => {
    const result = computeFuelReconciliation(
      baseInput({ period: { totalFuel: 100, totalCost: 250, logCount: 4, totalDistance: 900, fallbackPlates: [PLATE] } })
    );
    expect(result.distance.provenance).toBe('estimated');
    if (result.distance.provenance === 'estimated') {
      expect(result.distance.confidence).toBe('medium');
    }
    // Downstream CALCULATED values are unaffected by distance's own
    // provenance tier -- they still compute, just inherit lower confidence
    // implicitly through the chain a reader can trace via distance's badge.
    expect(result.expectedFuel.provenance).toBe('calculated');
  });

  it('does not attribute a fallback to a plate that is not in fallbackPlates (fleet-wide fallback list, one vehicle scoped)', () => {
    const result = computeFuelReconciliation(
      baseInput({
        period: { totalFuel: 100, totalCost: 250, logCount: 4, totalDistance: 900, fallbackPlates: ['SOME-OTHER-PLATE'] },
      })
    );
    expect(result.distance.provenance).toBe('actual');
  });
});

describe('computeFuelReconciliation: zero is not the same as missing', () => {
  it('reports a real ACTUAL zero when no fuel was purchased (logCount === 0) -- not "unavailable"', () => {
    const result = computeFuelReconciliation(
      baseInput({ period: { totalFuel: 0, totalCost: 0, logCount: 0, totalDistance: 900, fallbackPlates: [] } })
    );
    expect(result.actualFuel).toEqual({
      provenance: 'actual',
      value: 0,
      source: expect.stringContaining('No fuel logs recorded'),
    });
    expect(result.actualCost.provenance).toBe('actual');
  });

  it('still computes an expected fuel and a fuel variance when the period had no purchases but distance is known', () => {
    const result = computeFuelReconciliation(
      baseInput({ period: { totalFuel: 0, totalCost: 0, logCount: 0, totalDistance: 900, fallbackPlates: [] } })
    );
    expect(result.expectedFuel.provenance).toBe('calculated');
    expect(result.fuelVariance.provenance).toBe('derived');
    if (result.fuelVariance.provenance === 'derived') {
      // actual 0 - expected 90 = -90 (used less fuel than expected, or has not refuelled yet)
      expect(result.fuelVariance.value).toBeCloseTo(-90, 5);
    }
  });

  it('renders expected/variance COST as UNAVAILABLE (never a borrowed or fabricated price) when no fuel was purchased this period', () => {
    const result = computeFuelReconciliation(
      baseInput({ period: { totalFuel: 0, totalCost: 0, logCount: 0, totalDistance: 900, fallbackPlates: [] } })
    );
    expect(result.expectedCost.provenance).toBe('unavailable');
    if (result.expectedCost.provenance === 'unavailable') {
      expect(result.expectedCost.reason).toMatch(/no fuel was purchased/i);
    }
    expect(result.costVariance.provenance).toBe('unavailable');
  });

  it('treats zero PERIOD DISTANCE as UNAVAILABLE, not a confirmed zero -- the ambiguity is real (see file header)', () => {
    const result = computeFuelReconciliation(
      baseInput({ period: { totalFuel: 20, totalCost: 50, logCount: 1, totalDistance: 0, fallbackPlates: [] } })
    );
    expect(result.distance.provenance).toBe('unavailable');
    expect(result.expectedFuel.provenance).toBe('unavailable');
    expect(result.fuelVariance.provenance).toBe('unavailable');
    // Actual fuel is still reported -- one unknown input does not blank out a known one.
    expect(result.actualFuel.provenance).toBe('actual');
    if (result.actualFuel.provenance === 'actual') {
      expect(result.actualFuel.value).toBe(20);
    }
  });
});

describe('fuelValueOf / hasFuelValue', () => {
  it('extracts a value from actual/calculated/derived/estimated and null from unavailable/not-applicable', () => {
    expect(fuelValueOf({ provenance: 'actual', value: 5, source: 'x' })).toBe(5);
    expect(fuelValueOf({ provenance: 'calculated', value: 5, method: 'x' })).toBe(5);
    expect(fuelValueOf({ provenance: 'derived', value: 5, method: 'x' })).toBe(5);
    expect(fuelValueOf({ provenance: 'estimated', value: 5, method: 'x', confidence: 'low' })).toBe(5);
    expect(fuelValueOf({ provenance: 'unavailable', reason: 'x' })).toBeNull();
    expect(fuelValueOf({ provenance: 'not-applicable', reason: 'x' })).toBeNull();
  });

  it('hasFuelValue agrees with fuelValueOf on every provenance', () => {
    const values: FuelValue[] = [
      { provenance: 'actual', value: 1, source: 'x' },
      { provenance: 'calculated', value: 1, method: 'x' },
      { provenance: 'derived', value: 1, method: 'x' },
      { provenance: 'estimated', value: 1, method: 'x', confidence: 'high' },
      { provenance: 'unavailable', reason: 'x' },
      { provenance: 'not-applicable', reason: 'x' },
    ];
    for (const v of values) {
      expect(hasFuelValue(v)).toBe(fuelValueOf(v) !== null);
    }
  });
});

describe('fuelProvenanceLabel / fuelProvenanceExplanation', () => {
  it('uses the exact six labels named by the spec, each distinct', () => {
    const provenances = ['actual', 'calculated', 'derived', 'estimated', 'unavailable', 'not-applicable'] as const;
    const labels = provenances.map(fuelProvenanceLabel);
    expect(labels).toEqual(['ACTUAL', 'CALCULATED', 'DERIVED', 'ESTIMATED', 'UNAVAILABLE', 'NOT APPLICABLE']);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('every provenance has a non-empty explanation, and unavailable explicitly denies being a zero', () => {
    expect(fuelProvenanceExplanation({ provenance: 'unavailable', reason: 'no data' })).toMatch(
      /not a reading of zero/i
    );
    expect(fuelProvenanceExplanation({ provenance: 'actual', value: 1, source: 'x' }).length).toBeGreaterThan(0);
    expect(fuelProvenanceExplanation({ provenance: 'calculated', value: 1, method: 'x' }).length).toBeGreaterThan(0);
    expect(fuelProvenanceExplanation({ provenance: 'derived', value: 1, method: 'x' }).length).toBeGreaterThan(0);
    expect(
      fuelProvenanceExplanation({ provenance: 'estimated', value: 1, method: 'x', confidence: 'low' })
    ).toMatch(/low/);
    expect(fuelProvenanceExplanation({ provenance: 'not-applicable', reason: 'x' })).toMatch(/does not apply/i);
  });
});

describe('baselineWindowFor', () => {
  it('ends immediately before the period start and spans BASELINE_WINDOW_DAYS, never overlapping the period', () => {
    const periodStart = new Date('2026-09-01T00:00:00.000Z');
    const { startDate, endDate } = baselineWindowFor(periodStart);

    expect(endDate.getTime()).toBe(periodStart.getTime() - 1);
    expect(startDate.getTime()).toBe(endDate.getTime() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    expect(endDate.getTime()).toBeLessThan(periodStart.getTime());
  });
});
