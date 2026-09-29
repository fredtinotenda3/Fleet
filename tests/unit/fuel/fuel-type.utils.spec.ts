// tests/unit/fuel/fuel-type.utils.spec.ts
//
// "Fuel Type Distribution" showed Diesel(91.6%)/diesel(3.3%) and
// Petrol(4.9%)/petrol(0.3%) as four slices instead of two, because
// fuel_type has always been a free string and
// FuelRepository.getFuelTypeDistribution grouped on it with no
// case-folding (Mongo's $group is case-sensitive). This file asserts
// the fix at both layers: the canonicalization function itself
// (normalizeFuelType) and the defensive re-grouping
// (groupFuelTypeDistribution) that makes the chart correct even for a
// tenant whose historical rows haven't been through the backfill script.

import { normalizeFuelType, groupFuelTypeDistribution, KNOWN_FUEL_TYPE_VALUES } from '../../../modules/fuel/utils/fuel-type.utils';

describe('normalizeFuelType', () => {
  it.each([
    ['Diesel', 'Diesel'],
    ['diesel', 'Diesel'],
    ['DIESEL', 'Diesel'],
    [' Diesel', 'Diesel'],
    ['Diesel ', 'Diesel'],
    ['  diesel  ', 'Diesel'],
  ])('normalizes %j to "Diesel"', (input, expected) => {
    expect(normalizeFuelType(input).normalized).toBe(expected);
  });

  it.each([
    ['Petrol', 'Petrol'],
    ['petrol', 'Petrol'],
    ['PETROL', 'Petrol'],
    [' Petrol', 'Petrol'],
    ['Petrol ', 'Petrol'],
  ])('normalizes %j to "Petrol"', (input, expected) => {
    expect(normalizeFuelType(input).normalized).toBe(expected);
  });

  it('normalizes the platform\'s other known types (electric, hybrid) case-insensitively', () => {
    expect(normalizeFuelType('electric').normalized).toBe('Electric');
    expect(normalizeFuelType('ELECTRIC').normalized).toBe('Electric');
    expect(normalizeFuelType('hybrid').normalized).toBe('Hybrid');
    expect(normalizeFuelType('HYBRID').normalized).toBe('Hybrid');
  });

  it('never drops or rejects an unknown fuel type -- Title-Cases it deterministically instead', () => {
    expect(normalizeFuelType('lpg').normalized).toBe('Lpg');
    expect(normalizeFuelType('LPG').normalized).toBe('Lpg');
    expect(normalizeFuelType('cng').normalized).toBe('Cng');
    expect(normalizeFuelType('bio diesel').normalized).toBe('Bio Diesel');
  });

  it('is idempotent -- normalizing an already-canonical value returns the same string', () => {
    for (const known of KNOWN_FUEL_TYPE_VALUES) {
      expect(normalizeFuelType(known).normalized).toBe(known);
      expect(normalizeFuelType(normalizeFuelType(known).normalized).normalized).toBe(known);
    }
  });

  it('preserves the original value verbatim in `raw`, never destroying it', () => {
    expect(normalizeFuelType('  diesel  ').raw).toBe('diesel');
    expect(normalizeFuelType('DIESEL').raw).toBe('DIESEL');
    expect(normalizeFuelType(' Diesel').raw).toBe('Diesel');
  });

  it.each([undefined, null, '', '   '])('returns null (not a fabricated value) for %j', (input) => {
    expect(normalizeFuelType(input).normalized).toBeNull();
  });
});

describe('groupFuelTypeDistribution', () => {
  it('collapses Diesel/diesel/DIESEL/ Diesel into one canonical row', () => {
    const rows = groupFuelTypeDistribution([
      { _id: 'Diesel', litres: 100, cost: 150 },
      { _id: 'diesel', litres: 30, cost: 45 },
      { _id: 'DIESEL', litres: 10, cost: 15 },
      { _id: ' Diesel', litres: 5, cost: 7.5 },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].fuelType).toBe('Diesel');
    expect(rows[0].litres).toBe(145);
    expect(rows[0].cost).toBe(217.5);
    expect(rows[0].percentage).toBe(100);
  });

  it('collapses Petrol/petrol/PETROL into one canonical row, distinct from Diesel', () => {
    const rows = groupFuelTypeDistribution([
      { _id: 'Diesel', litres: 916, cost: 1000 },
      { _id: 'Petrol', litres: 49, cost: 60 },
      { _id: 'diesel', litres: 33, cost: 40 },
      { _id: 'petrol', litres: 3, cost: 4 },
    ]);

    expect(rows).toHaveLength(2);
    const byType = Object.fromEntries(rows.map((r) => [r.fuelType, r]));
    expect(byType.Diesel.litres).toBe(949);
    expect(byType.Petrol.litres).toBe(52);
    // percentages sum to 100 (within rounding)
    const totalPct = rows.reduce((sum, r) => sum + r.percentage, 0);
    expect(totalPct).toBeGreaterThan(99.5);
    expect(totalPct).toBeLessThanOrEqual(100.5);
  });

  it('buckets a missing fuel_type as "Unspecified", never invented as a real type', () => {
    const rows = groupFuelTypeDistribution([{ _id: 'unspecified', litres: 20, cost: 30 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].fuelType).toBe('Unspecified');
  });

  it('returns an empty array for no data, never divides by zero', () => {
    expect(groupFuelTypeDistribution([])).toEqual([]);
  });

  it('sorts rows by litres descending', () => {
    const rows = groupFuelTypeDistribution([
      { _id: 'Petrol', litres: 10, cost: 10 },
      { _id: 'Diesel', litres: 90, cost: 90 },
    ]);
    expect(rows.map((r) => r.fuelType)).toEqual(['Diesel', 'Petrol']);
  });
});
