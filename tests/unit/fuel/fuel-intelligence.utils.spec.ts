// tests/unit/fuel/fuel-intelligence.utils.spec.ts
//
// PART 19 ("Add tests for... reporting: monthly filtering, vehicle/
// driver/cost analysis, anomaly calculations, allocation calculations,
// unavailable-data handling, empty datasets"). Pure-function tests for
// modules/fuel/reporting/fuel-intelligence.utils.ts -- the decision
// logic behind the Monthly Fuel & Fleet Intelligence Report. No database
// involved, matching this file's own header rationale.

import {
  resolveReportPeriod,
  resolvePreviousPeriod,
  computeMonthOverMonthMetric,
  classifyCostDrivers,
  computeCostConcentration,
  assessDataQuality,
  reconcileAllocation,
  ABNORMAL_COST_MATERIALITY_FLOOR,
} from '../../../modules/fuel/reporting/fuel-intelligence.utils';
import { unavailable } from '../../../modules/fuel/reporting/fuel-intelligence.types';

describe('resolveReportPeriod', () => {
  it('resolves a calendar month to its UTC start/end instants', () => {
    const period = resolveReportPeriod('2026-09');
    expect(period.month).toBe('2026-09');
    expect(period.label).toBe('September 2026');
    expect(period.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });

  it('handles December correctly (year rollover on the end boundary)', () => {
    const period = resolveReportPeriod('2026-12');
    expect(period.end.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('handles leap-year February', () => {
    const period = resolveReportPeriod('2028-02');
    expect(period.end.toISOString()).toBe('2028-02-29T23:59:59.999Z');
  });

  it('rejects a malformed month string', () => {
    expect(() => resolveReportPeriod('2026-9')).toThrow(/Invalid report month/);
    expect(() => resolveReportPeriod('Sep-2026')).toThrow(/Invalid report month/);
    expect(() => resolveReportPeriod('2026-13')).toThrow(/Invalid report month/);
    expect(() => resolveReportPeriod('2026-00')).toThrow(/Invalid report month/);
  });
});

describe('resolvePreviousPeriod', () => {
  it('resolves the prior calendar month within a year', () => {
    const period = resolveReportPeriod('2026-09');
    const prev = resolvePreviousPeriod(period);
    expect(prev.month).toBe('2026-08');
  });

  it('rolls over the year boundary (January -> prior December)', () => {
    const period = resolveReportPeriod('2026-01');
    const prev = resolvePreviousPeriod(period);
    expect(prev.month).toBe('2025-12');
  });
});

describe('computeMonthOverMonthMetric', () => {
  it('computes delta and percentage when both periods have data', () => {
    const metric = computeMonthOverMonthMetric('Total fuel cost', 'currency', 1200, 1000, unavailable('n/a'));
    expect(metric.current.status).toBe('FACT');
    expect(metric.previous.status).toBe('FACT');
    expect(metric.delta).toEqual({ status: 'CALCULATED', value: 200 });
    expect(metric.deltaPercent).toEqual({ status: 'CALCULATED', value: 20 });
    expect(metric.direction).toBe('up');
  });

  it('reports "down" for a decrease and "flat" for no change', () => {
    expect(computeMonthOverMonthMetric('x', 'u', 80, 100, unavailable('n/a')).direction).toBe('down');
    expect(computeMonthOverMonthMetric('x', 'u', 100, 100, unavailable('n/a')).direction).toBe('flat');
  });

  it('marks delta/deltaPercent UNAVAILABLE when the prior period has no recorded data', () => {
    const metric = computeMonthOverMonthMetric('x', 'u', 500, null, unavailable('n/a'));
    expect(metric.previous.status).toBe('UNAVAILABLE');
    expect(metric.previous.reason).toMatch(/prior comparable period/);
    expect(metric.delta.status).toBe('UNAVAILABLE');
    expect(metric.direction).toBe('unavailable');
  });

  it('marks delta/deltaPercent UNAVAILABLE when current period has no data', () => {
    const metric = computeMonthOverMonthMetric('x', 'u', null, 500, unavailable('n/a'));
    expect(metric.current.status).toBe('UNAVAILABLE');
    expect(metric.delta.status).toBe('UNAVAILABLE');
  });

  it('never fabricates a percentage change when the prior period was zero', () => {
    const metric = computeMonthOverMonthMetric('x', 'u', 100, 0, unavailable('n/a'));
    expect(metric.delta).toEqual({ status: 'CALCULATED', value: 100 });
    expect(metric.deltaPercent.status).toBe('UNAVAILABLE');
    expect(metric.deltaPercent.reason).toMatch(/undefined/);
  });

  it('carries through whatever possibleExplanation the caller supplies without altering it', () => {
    const explanation = { status: 'CALCULATED' as const, value: 'average price per litre rose 12%' };
    const metric = computeMonthOverMonthMetric('x', 'u', 100, 80, explanation);
    expect(metric.possibleExplanation).toEqual(explanation);
  });
});

describe('classifyCostDrivers', () => {
  it('classifies the top-cost vehicle(s) as high_cost when no spike applies', () => {
    const current = [
      { license_plate: 'AFU0078', totalCost: 1000, totalLitres: 200, logCount: 10 },
      { license_plate: 'AFU0079', totalCost: 300, totalLitres: 60, logCount: 5 },
      { license_plate: 'AFU0080', totalCost: 100, totalLitres: 20, logCount: 3 },
    ];
    const rows = classifyCostDrivers(current, new Map());
    const top = rows.find((r) => r.license_plate === 'AFU0078')!;
    expect(top.classification).toBe('high_cost');
    expect(top.shareOfFleetCostPercent.value).toBeCloseTo(71.4, 0);
  });

  it('classifies a vehicle whose cost spiked past the threshold as abnormal_cost, taking precedence over high_cost', () => {
    const current = [{ license_plate: 'AFU0078', totalCost: 1000, totalLitres: 200, logCount: 10 }];
    const previous = new Map([['AFU0078', 400]]); // 2.5x increase, well past 1.5x and past the $50 floor
    const rows = classifyCostDrivers(current, previous);
    expect(rows[0].classification).toBe('abnormal_cost');
    expect(rows[0].abnormalReason).toMatch(/rose/);
  });

  it('does not classify a spike below the materiality floor as abnormal, even if the ratio qualifies', () => {
    const current = [{ license_plate: 'AFU0078', totalCost: 10, totalLitres: 2, logCount: 1 }];
    const previous = new Map([['AFU0078', 3]]); // 3.3x ratio, but only a $7 absolute increase (< $50 floor)
    const rows = classifyCostDrivers(current, previous, { abnormalMaterialityFloor: ABNORMAL_COST_MATERIALITY_FLOOR });
    expect(rows[0].classification).not.toBe('abnormal_cost');
  });

  it('does not classify a spike below the ratio threshold as abnormal, even if materially large', () => {
    const current = [{ license_plate: 'AFU0078', totalCost: 1100, totalLitres: 200, logCount: 10 }];
    const previous = new Map([['AFU0078', 1000]]); // only 1.1x, below the 1.5x threshold
    const rows = classifyCostDrivers(current, previous);
    expect(rows[0].classification).not.toBe('abnormal_cost');
  });

  it('never classifies a vehicle as abnormal without a previous-period baseline (a new vehicle)', () => {
    const current = [{ license_plate: 'NEW001', totalCost: 5000, totalLitres: 500, logCount: 20 }];
    const rows = classifyCostDrivers(current, new Map());
    // No baseline -> cannot be "abnormal" (a change), but can still be high_cost (a ranking).
    expect(rows[0].classification).toBe('high_cost');
  });

  it('classifies a low-ranking vehicle with no spike as normal', () => {
    const current = [
      { license_plate: 'A', totalCost: 1000, totalLitres: 100, logCount: 5 },
      { license_plate: 'B', totalCost: 900, totalLitres: 90, logCount: 5 },
      { license_plate: 'C', totalCost: 800, totalLitres: 80, logCount: 5 },
      { license_plate: 'D', totalCost: 700, totalLitres: 70, logCount: 5 },
      { license_plate: 'E', totalCost: 50, totalLitres: 5, logCount: 1 },
    ];
    const rows = classifyCostDrivers(current, new Map());
    expect(rows.find((r) => r.license_plate === 'E')!.classification).toBe('normal');
  });

  it('respects a caller-supplied threshold override', () => {
    const current = [{ license_plate: 'AFU0078', totalCost: 130, totalLitres: 20, logCount: 2 }];
    const previous = new Map([['AFU0078', 100]]); // 1.3x -- below default 1.5x
    const rows = classifyCostDrivers(current, previous, {
      abnormalSpikeMultiplier: 1.2,
      abnormalMaterialityFloor: 10,
    });
    expect(rows[0].classification).toBe('abnormal_cost');
  });
});

describe('computeCostConcentration', () => {
  it('computes the top-N vehicle cost share', () => {
    const current = [
      { license_plate: 'A', totalCost: 500, totalLitres: 50, logCount: 5 },
      { license_plate: 'B', totalCost: 300, totalLitres: 30, logCount: 3 },
      { license_plate: 'C', totalCost: 200, totalLitres: 20, logCount: 2 },
    ];
    const result = computeCostConcentration(current, 1);
    expect(result.status).toBe('CALCULATED');
    expect(result.value).toEqual({ vehicleCount: 1, costSharePercent: 50 });
  });

  it('is UNAVAILABLE for an empty fleet', () => {
    expect(computeCostConcentration([], 5).status).toBe('UNAVAILABLE');
  });

  it('is UNAVAILABLE when total cost is zero', () => {
    const current = [{ license_plate: 'A', totalCost: 0, totalLitres: 0, logCount: 1 }];
    expect(computeCostConcentration(current, 5).status).toBe('UNAVAILABLE');
  });
});

describe('assessDataQuality', () => {
  const base = { license_plate: 'AFU0078', date: '2026-09-01', fuel_volume: 50, cost: 100 };

  it('is insufficient_data for an empty period', () => {
    const result = assessDataQuality([], false);
    expect(result.overallAssessment).toBe('insufficient_data');
    expect(result.totalLogsInPeriod).toBe(0);
  });

  it('is "good" when every field is complete and there are no duplicates', () => {
    const logs = [
      { ...base, driver_id: 'd1', fuel_type: 'Diesel', odometer: 1000 },
      { ...base, license_plate: 'AFU0079', driver_id: 'd2', fuel_type: 'Petrol', odometer: 2000 },
    ];
    const result = assessDataQuality(logs, false);
    expect(result.overallAssessment).toBe('good');
    expect(result.metrics.every((m) => m.affectedCount === 0)).toBe(true);
  });

  it('flags missing driver/fuel_type/odometer with correct percentages', () => {
    const logs = [
      { ...base, driver_id: null, fuel_type: null, odometer: null },
      { ...base, license_plate: 'AFU0079', driver_id: 'd1', fuel_type: 'Diesel', odometer: 500 },
    ];
    const result = assessDataQuality(logs, false);
    const missingDriver = result.metrics.find((m) => m.label.includes('no driver'))!;
    expect(missingDriver.affectedCount).toBe(1);
    expect(missingDriver.percent).toBe(50);
  });

  it('flags suspected duplicates by (vehicle, date, volume, cost) signature', () => {
    const logs = [
      { ...base, driver_id: 'd1', fuel_type: 'Diesel', odometer: 100 },
      { ...base, driver_id: 'd1', fuel_type: 'Diesel', odometer: 100 }, // exact duplicate signature
      { ...base, license_plate: 'AFU0079', driver_id: 'd2', fuel_type: 'Petrol', odometer: 200 },
    ];
    const result = assessDataQuality(logs, false);
    const dup = result.metrics.find((m) => m.label.includes('duplicate'))!;
    expect(dup.affectedCount).toBe(2);
  });

  it('does not flag two different fill-ups on the same day for the same vehicle as duplicates (different volume/cost)', () => {
    const logs = [
      { ...base, driver_id: 'd1', fuel_type: 'Diesel', odometer: 100 },
      { ...base, driver_id: 'd1', fuel_type: 'Diesel', odometer: 150, fuel_volume: 30, cost: 60 },
    ];
    const result = assessDataQuality(logs, false);
    const dup = result.metrics.find((m) => m.label.includes('duplicate'))!;
    expect(dup.affectedCount).toBe(0);
  });

  it('reports overallAssessment as poor when issues are widespread', () => {
    const logs = Array.from({ length: 10 }, (_, i) => ({
      ...base,
      license_plate: `V${i}`,
      driver_id: null,
      fuel_type: null,
      odometer: null,
    }));
    const result = assessDataQuality(logs, false);
    expect(result.overallAssessment).toBe('poor');
  });

  it('carries through the truncated flag from the caller', () => {
    const logs = [{ ...base, driver_id: 'd1', fuel_type: 'Diesel', odometer: 100 }];
    expect(assessDataQuality(logs, true).truncated).toBe(true);
    expect(assessDataQuality(logs, false).truncated).toBe(false);
  });
});

describe('reconcileAllocation', () => {
  it('marks totals reconciled when within the materiality threshold', () => {
    const result = reconcileAllocation(1000, 995); // 0.5% variance
    expect(result.reconciled).toBe(true);
    expect(result.variance.value).toBe(5);
  });

  it('flags a material variance as not reconciled, with both totals still shown as FACT', () => {
    const result = reconcileAllocation(1200, 1000); // 20% variance
    expect(result.reconciled).toBe(false);
    expect(result.operationalTotal.status).toBe('FACT');
    expect(result.ledgerTotal.status).toBe('FACT');
    expect(result.note).toMatch(/differ by/);
  });

  it('is UNAVAILABLE (not a fabricated zero) when the operational total is missing', () => {
    const result = reconcileAllocation(null, 1000);
    expect(result.operationalTotal.status).toBe('UNAVAILABLE');
    expect(result.reconciled).toBeNull();
  });

  it('is UNAVAILABLE when the ledger total is missing', () => {
    const result = reconcileAllocation(1000, null);
    expect(result.ledgerTotal.status).toBe('UNAVAILABLE');
    expect(result.reconciled).toBeNull();
  });

  it('never divides by zero when the ledger total is exactly zero', () => {
    const result = reconcileAllocation(50, 0);
    expect(result.variance.value).toBe(50);
    expect(result.variancePercent.status).toBe('UNAVAILABLE');
  });

  it('treats two zero totals as reconciled', () => {
    const result = reconcileAllocation(0, 0);
    expect(result.variance.value).toBe(0);
    expect(result.variancePercent.value).toBe(0);
    expect(result.reconciled).toBe(true);
  });
});
