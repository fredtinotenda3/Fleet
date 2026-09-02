// tests/unit/leaderboard/leaderboard-utils.spec.ts
//
// Pure-function tests for the Fleet Leaderboard's ranking, aggregation
// and formatting helpers (frontend/modules/leaderboard/utils/
// leaderboard.utils.ts). No React/jsdom involved -- this repo's
// jest.config.js runs under testEnvironment: 'node' with no React
// Testing Library wired up (see tests/unit/drivers/
// driver-risk-utils.spec.ts for the same convention), so these
// functions are deliberately dependency-free specifically so their
// logic can be verified directly.

import {
  batchFindings,
  buildDriverLeaderboard,
  buildMaintenanceCostLeaderboard,
  buildRepairCountLeaderboard,
  buildVehicleAlertLeaderboard,
  buildVehicleAlertRows,
  compareLabels,
  countBatchFindings,
  driverMetricValue,
  formatLeaderboardValue,
  formatRankLabel,
  maxSeverity,
  NO_VALUE,
  rankRows,
  safeNumber,
  shareOfTotal,
  sumBy,
  toDriverLeaderboardRows,
  truncateLabel,
} from '@/frontend/modules/leaderboard/utils/leaderboard.utils';
import type {
  AiBatchResult,
  AiDashboardSummary,
  FuelFraudAlert,
  MostExpensiveVehicleRow,
  PredictiveMaintenancePrediction,
  RepairFrequencyByVehicleRow,
} from '@/frontend/modules/leaderboard/types';
import type {
  DriverRiskBatchItem,
  DriverRiskBatchResult,
  DriverRiskScore,
} from '@/frontend/modules/ai/types/driver-risk.types';

// ─── Fixtures ──────────────────────────────────────────────────────────

function driverScore(overrides: Partial<DriverRiskScore> & { driverId: string }): DriverRiskScore {
  return {
    driverName: `Driver ${overrides.driverId}`,
    overallScore: 50,
    riskLevel: 'medium',
    timestamp: '2026-09-01T00:00:00.000Z',
    trends: [],
    recommendations: [],
    incidents: [],
    ...overrides,
    metrics: {
      speedingEvents: 0,
      hardBrakes: 0,
      hardAccelerations: 0,
      idlingTime: 0,
      nightDrivingHours: 0,
      fatigueScore: 0,
      distractionScore: 0,
      safetyScore: 100,
      ...overrides.metrics,
    },
  };
}

function driverBatch(items: DriverRiskBatchItem[]): DriverRiskBatchResult {
  return {
    success: true,
    results: items,
    total: items.length,
    succeeded: items.filter((item) => item.success).length,
    failed: items.filter((item) => !item.success).length,
    timestamp: '2026-09-01T00:00:00.000Z',
  };
}

function prediction(
  overrides: Partial<PredictiveMaintenancePrediction> & { vehicleId: string }
): PredictiveMaintenancePrediction {
  return {
    predictionId: `pm-${overrides.vehicleId}`,
    licensePlate: `PLATE-${overrides.vehicleId}`,
    component: 'brakes',
    predictedFailureDate: '2026-10-01T00:00:00.000Z',
    confidence: 0.8,
    severity: 'medium',
    estimatedCost: 100,
    recommendedAction: 'Inspect',
    urgency: 'soon',
    ...overrides,
  };
}

function fraudAlert(overrides: Partial<FuelFraudAlert> & { vehicleId: string }): FuelFraudAlert {
  return {
    alertId: `ff-${overrides.vehicleId}`,
    licensePlate: `PLATE-${overrides.vehicleId}`,
    confidence: 0.7,
    severity: 'high',
    timestamp: '2026-09-01T00:00:00.000Z',
    status: 'open',
    ...overrides,
  };
}

function batch<T>(results: AiBatchResult<T>['results']): AiBatchResult<T> {
  return {
    success: true,
    results,
    total: results.length,
    succeeded: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    timestamp: '2026-09-01T00:00:00.000Z',
  };
}

function summary(overrides: Partial<AiDashboardSummary> = {}): AiDashboardSummary {
  return {
    fleetHealth: null,
    predictiveMaintenance: null,
    driverRisk: null,
    fuelFraud: null,
    expenseAnomalies: null,
    timestamp: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── safeNumber / sumBy ────────────────────────────────────────────────

describe('safeNumber', () => {
  it('passes finite numbers through, including a real zero and negatives', () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(-3.5)).toBe(-3.5);
  });

  it('falls back for null, undefined, NaN and Infinity', () => {
    // Mongo's $sum over a field absent on every matched document yields
    // null, which arrives here as null over the wire. Left unguarded it
    // would not throw -- it would silently sort to the bottom and render
    // as "0", which is the failure this guard exists to prevent.
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber(Number.NaN)).toBe(0);
    expect(safeNumber(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('falls back for non-numeric types rather than coercing them', () => {
    expect(safeNumber('12')).toBe(0);
    expect(safeNumber({})).toBe(0);
    expect(safeNumber(true)).toBe(0);
  });

  it('honours a caller-supplied fallback', () => {
    expect(safeNumber(null, -1)).toBe(-1);
  });
});

describe('sumBy', () => {
  it('sums a numeric field', () => {
    expect(sumBy([{ n: 1 }, { n: 2 }, { n: 3 }], (row) => row.n)).toBe(6);
  });

  it('skips unusable values instead of propagating NaN', () => {
    const rows = [{ n: 5 }, { n: null }, { n: Number.NaN }, { n: 5 }];
    expect(sumBy(rows, (row) => row.n)).toBe(10);
  });

  it('returns 0 for an empty list', () => {
    expect(sumBy([], (row: { n: number }) => row.n)).toBe(0);
  });
});

// ─── maxSeverity ───────────────────────────────────────────────────────

describe('maxSeverity', () => {
  it('returns the more serious of two severities regardless of argument order', () => {
    expect(maxSeverity('low', 'critical')).toBe('critical');
    expect(maxSeverity('critical', 'low')).toBe('critical');
    expect(maxSeverity('medium', 'high')).toBe('high');
  });

  it('is idempotent for equal severities', () => {
    expect(maxSeverity('high', 'high')).toBe('high');
  });

  it('orders the full scale consistently with the telematics alert engine', () => {
    // Mirrors SEVERITY_ORDER in modules/telematics/services/
    // reading-alerts.ts, so a severity means the same thing here as it
    // does on the live map.
    expect(maxSeverity('low', 'medium')).toBe('medium');
    expect(maxSeverity('medium', 'high')).toBe('high');
    expect(maxSeverity('high', 'critical')).toBe('critical');
  });
});

// ─── batchFindings / countBatchFindings ────────────────────────────────

describe('batchFindings', () => {
  it('keeps only items that both succeeded and carry data', () => {
    const result = batch<PredictiveMaintenancePrediction>([
      { entityId: 'v1', success: true, data: prediction({ vehicleId: 'v1' }) },
      { entityId: 'v2', success: false, error: 'No prediction' },
      { entityId: 'v3', success: true, data: undefined },
    ]);

    expect(batchFindings(result).map((item) => item.entityId)).toEqual(['v1']);
  });

  it('does not count an expense-anomaly batch\'s clean rows as findings', () => {
    // This is the bug the predicate exists to prevent. Unlike the other
    // two batches, expense-anomaly detection pushes EVERY expense with
    // success: true and leaves `data` undefined for a normal one, so
    // `succeeded` is the number of expenses examined. Counting it would
    // report a fleet with 3 clean expenses as having 3 anomalies.
    const result = batch<{ alertId: string }>([
      { entityId: 'e1', success: true, data: undefined },
      { entityId: 'e2', success: true, data: undefined },
      { entityId: 'e3', success: true, data: { alertId: 'a1' } },
    ]);

    expect(result.succeeded).toBe(3);
    expect(countBatchFindings(result)).toBe(1);
  });

  it('returns an empty list for a null, undefined or malformed batch', () => {
    expect(batchFindings(null)).toEqual([]);
    expect(batchFindings(undefined)).toEqual([]);
    expect(batchFindings({ results: undefined } as never)).toEqual([]);
  });
});

describe('countBatchFindings', () => {
  it('returns null for an absent batch, never 0', () => {
    // getAIDashboard() maps a failed AI service to null rather than
    // failing the whole response. Returning 0 here would print "no fuel
    // fraud in your fleet" on the strength of a request that never
    // completed.
    expect(countBatchFindings(null)).toBeNull();
    expect(countBatchFindings(undefined)).toBeNull();
  });

  it('returns a real 0 for a batch that ran and found nothing', () => {
    const result = batch<FuelFraudAlert>([
      { entityId: 'v1', success: false, error: 'No anomalies detected' },
    ]);
    expect(countBatchFindings(result)).toBe(0);
  });
});

// ─── rankRows ──────────────────────────────────────────────────────────

function input(id: string, value: number, label = id) {
  return { id, label, value, source: { id, value } };
}

describe('rankRows', () => {
  it('ranks descending by default, largest value at rank 1', () => {
    const ranked = rankRows([input('a', 5), input('b', 20), input('c', 12)]);
    expect(ranked.map((row) => [row.id, row.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('ranks ascending when asked', () => {
    const ranked = rankRows([input('a', 5), input('b', 20)], { order: 'asc' });
    expect(ranked.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('uses standard competition ranking for ties (1, 2, 2, 4)', () => {
    // Dense ranking (1, 2, 2, 3) would place the last row at "number 3"
    // with three rows ahead of it, which misstates the position.
    const ranked = rankRows([input('a', 10), input('b', 7), input('c', 7), input('d', 1)]);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 2, 4]);
  });

  it('flags tied rows and leaves distinct rows unflagged', () => {
    const ranked = rankRows([input('a', 7), input('b', 7), input('c', 3)]);
    expect(ranked.map((row) => row.tied)).toEqual([true, true, false]);
  });

  it('breaks ties deterministically on label, not on input order', () => {
    // The input order is a Mongo aggregation whose order among equal
    // sort keys is not guaranteed, so without an explicit tie-break the
    // same fleet could render in a different order on consecutive
    // polls, which reads as flicker.
    const forward = rankRows([input('x', 4, 'Zeta'), input('y', 4, 'Alpha')]);
    const reversed = rankRows([input('y', 4, 'Alpha'), input('x', 4, 'Zeta')]);
    expect(forward.map((row) => row.label)).toEqual(['Alpha', 'Zeta']);
    expect(reversed.map((row) => row.label)).toEqual(['Alpha', 'Zeta']);
  });

  it('applies limit after ranking, so ranks reflect the full list', () => {
    const ranked = rankRows([input('a', 1), input('b', 2), input('c', 3)], { limit: 2 });
    expect(ranked.map((row) => [row.id, row.rank])).toEqual([
      ['c', 1],
      ['b', 2],
    ]);
  });

  it('treats limit 0 as "no rows" rather than "no limit"', () => {
    expect(rankRows([input('a', 1)], { limit: 0 })).toEqual([]);
  });

  it('coerces unusable values to 0 rather than producing NaN ranks', () => {
    const ranked = rankRows([
      { id: 'a', label: 'a', value: null as unknown as number, source: {} },
      input('b', 5),
    ]);
    expect(ranked.map((row) => [row.id, row.value])).toEqual([
      ['b', 5],
      ['a', 0],
    ]);
  });

  it('drops zero-valued rows only when asked to', () => {
    const rows = [input('a', 0), input('b', 3)];
    expect(rankRows(rows).map((row) => row.id)).toEqual(['b', 'a']);
    expect(rankRows(rows, { omitZeroValues: true }).map((row) => row.id)).toEqual(['b']);
  });

  it('does not mutate its input array or reorder it', () => {
    const rows = [input('a', 1), input('b', 9)];
    const snapshot = rows.map((row) => row.id);
    rankRows(rows);
    expect(rows.map((row) => row.id)).toEqual(snapshot);
  });

  it('returns an empty list for empty input', () => {
    expect(rankRows([])).toEqual([]);
  });
});

describe('compareLabels', () => {
  it('orders case-insensitively', () => {
    expect(compareLabels('alpha', 'Beta')).toBeLessThan(0);
    expect(compareLabels('Beta', 'alpha')).toBeGreaterThan(0);
  });

  it('still totally orders labels differing only in case', () => {
    expect(compareLabels('ab', 'AB')).not.toBe(0);
    expect(compareLabels('ab', 'ab')).toBe(0);
  });
});

// ─── Driver leaderboard ────────────────────────────────────────────────

describe('toDriverLeaderboardRows', () => {
  it('drops items that failed or carry no data', () => {
    // A driver the model could not score is not a driver scoring zero,
    // and a zero on a risk leaderboard reads as exemplary.
    const rows = toDriverLeaderboardRows(
      driverBatch([
        { entityId: 'd1', success: true, data: driverScore({ driverId: 'd1' }) },
        { entityId: 'd2', success: false, error: 'No trips' },
        { entityId: 'd3', success: true, data: undefined },
      ])
    );

    expect(rows.map((row) => row.driverId)).toEqual(['d1']);
  });

  it('sums the three event counters into alertEvents', () => {
    const rows = toDriverLeaderboardRows(
      driverBatch([
        {
          entityId: 'd1',
          success: true,
          data: driverScore({
            driverId: 'd1',
            metrics: { speedingEvents: 4, hardBrakes: 3, hardAccelerations: 2 } as never,
          }),
        },
      ])
    );

    expect(rows[0].alertEvents).toBe(9);
  });

  it('falls back to the batch entityId when the payload omits driverId', () => {
    const rows = toDriverLeaderboardRows(
      driverBatch([
        { entityId: 'd-entity', success: true, data: driverScore({ driverId: '' }) },
      ])
    );
    expect(rows[0].driverId).toBe('d-entity');
  });

  it('returns an empty list for a null batch', () => {
    expect(toDriverLeaderboardRows(null)).toEqual([]);
    expect(toDriverLeaderboardRows(undefined)).toEqual([]);
  });
});

describe('driverMetricValue', () => {
  const row = {
    driverId: 'd1',
    driverName: 'A',
    riskScore: 71,
    riskLevel: 'high' as const,
    speedingEvents: 2,
    hardBrakes: 3,
    hardAccelerations: 1,
    alertEvents: 6,
  };

  it('reads overallScore for risk-score and the event sum for alert-events', () => {
    expect(driverMetricValue(row, 'risk-score')).toBe(71);
    expect(driverMetricValue(row, 'alert-events')).toBe(6);
  });
});

describe('buildDriverLeaderboard', () => {
  const batchWithThree = driverBatch([
    {
      entityId: 'd1',
      success: true,
      data: driverScore({
        driverId: 'd1',
        driverName: 'Safe Sam',
        overallScore: 10,
        riskLevel: 'low',
        metrics: { speedingEvents: 9, hardBrakes: 9, hardAccelerations: 9 } as never,
      }),
    },
    {
      entityId: 'd2',
      success: true,
      data: driverScore({
        driverId: 'd2',
        driverName: 'Risky Rita',
        overallScore: 90,
        riskLevel: 'critical',
        metrics: { speedingEvents: 1, hardBrakes: 0, hardAccelerations: 0 } as never,
      }),
    },
    {
      entityId: 'd3',
      success: true,
      data: driverScore({ driverId: 'd3', driverName: 'Mid Mo', overallScore: 50 }),
    },
  ]);

  it('ranks the highest risk score first', () => {
    // overallScore is documented as lower = safer, so descending is
    // "worst first" -- the same polarity as the event count.
    const ranked = buildDriverLeaderboard(batchWithThree, 'risk-score');
    expect(ranked.map((row) => row.source.driverName)).toEqual(['Risky Rita', 'Mid Mo', 'Safe Sam']);
  });

  it('ranks by event count when the metric changes, producing a different order', () => {
    const ranked = buildDriverLeaderboard(batchWithThree, 'alert-events');
    expect(ranked[0].source.driverName).toBe('Safe Sam');
    expect(ranked[0].value).toBe(27);
  });

  it('honours the limit', () => {
    expect(buildDriverLeaderboard(batchWithThree, 'risk-score', 2)).toHaveLength(2);
  });

  it('returns an empty list rather than throwing when the panel is null', () => {
    expect(buildDriverLeaderboard(null, 'risk-score')).toEqual([]);
  });
});

// ─── Vehicle leaderboard ───────────────────────────────────────────────

describe('buildVehicleAlertRows', () => {
  it('merges predictive-maintenance and fuel-fraud findings on vehicleId', () => {
    const rows = buildVehicleAlertRows(
      summary({
        predictiveMaintenance: batch([
          { entityId: 'v1', success: true, data: prediction({ vehicleId: 'v1', estimatedCost: 300 }) },
        ]),
        fuelFraud: batch([{ entityId: 'v1', success: true, data: fraudAlert({ vehicleId: 'v1' }) }]),
      })
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      vehicleId: 'v1',
      predictiveMaintenanceCount: 1,
      fuelFraudCount: 1,
      totalAlerts: 2,
      estimatedCost: 300,
    });
  });

  it('keeps the worst severity across both sources', () => {
    const rows = buildVehicleAlertRows(
      summary({
        predictiveMaintenance: batch([
          { entityId: 'v1', success: true, data: prediction({ vehicleId: 'v1', severity: 'low' }) },
        ]),
        fuelFraud: batch([
          { entityId: 'v1', success: true, data: fraudAlert({ vehicleId: 'v1', severity: 'critical' }) },
        ]),
      })
    );

    expect(rows[0].worstSeverity).toBe('critical');
  });

  it('never attributes an expense anomaly to a vehicle', () => {
    // ExpenseAnomalyAlert.entityId is the EXPENSE record's _id and the
    // alert carries no plate, so treating it as a vehicle id would
    // produce a leaderboard of vehicles that do not exist.
    const rows = buildVehicleAlertRows(
      summary({
        expenseAnomalies: batch([
          {
            entityId: 'expense-abc',
            success: true,
            data: {
              alertId: 'a1',
              entityId: 'expense-abc',
              entityType: 'vehicle',
              confidence: 0.9,
              severity: 'high',
              timestamp: '2026-09-01T00:00:00.000Z',
              status: 'open',
            },
          },
        ]),
      })
    );

    expect(rows).toEqual([]);
  });

  it('ignores fleetHealth vehicle scores', () => {
    // A 0-100 health score is not a count of alerts; summing it in
    // would let one unhealthy vehicle outrank a hundred real findings.
    const rows = buildVehicleAlertRows(
      summary({
        fleetHealth: {
          overallScore: 40,
          timestamp: '2026-09-01T00:00:00.000Z',
          vehicleScores: [{ vehicleId: 'v9', licensePlate: 'PLATE-v9', score: 12, components: {} }],
          metrics: {
            averageVehicleAge: 0,
            averageMileage: 0,
            maintenanceCompletionRate: 0,
            pendingMaintenanceCount: 0,
            overdueMaintenanceCount: 0,
            averageDowntime: 0,
            fuelEfficiencyAverage: 0,
          },
        },
      })
    );

    expect(rows).toEqual([]);
  });

  it('accumulates several findings for the same vehicle', () => {
    const rows = buildVehicleAlertRows(
      summary({
        predictiveMaintenance: batch([
          { entityId: 'v1', success: true, data: prediction({ vehicleId: 'v1', estimatedCost: 100 }) },
          {
            entityId: 'v1-b',
            success: true,
            data: prediction({ vehicleId: 'v1', predictionId: 'pm-2', estimatedCost: 250 }),
          },
        ]),
      })
    );

    expect(rows[0].predictiveMaintenanceCount).toBe(2);
    expect(rows[0].estimatedCost).toBe(350);
  });

  it('returns an empty list for a null summary', () => {
    expect(buildVehicleAlertRows(null)).toEqual([]);
    expect(buildVehicleAlertRows(summary())).toEqual([]);
  });
});

describe('buildVehicleAlertLeaderboard', () => {
  it('ranks by total alerts and labels by plate', () => {
    const ranked = buildVehicleAlertLeaderboard(
      summary({
        predictiveMaintenance: batch([
          { entityId: 'v1', success: true, data: prediction({ vehicleId: 'v1', licensePlate: 'AAA-111' }) },
          { entityId: 'v2', success: true, data: prediction({ vehicleId: 'v2', licensePlate: 'BBB-222' }) },
        ]),
        fuelFraud: batch([
          { entityId: 'v2', success: true, data: fraudAlert({ vehicleId: 'v2', licensePlate: 'BBB-222' }) },
        ]),
      })
    );

    expect(ranked.map((row) => [row.label, row.value])).toEqual([
      ['BBB-222', 2],
      ['AAA-111', 1],
    ]);
  });

  it('falls back to the vehicle id as the label when no plate was reported', () => {
    const ranked = buildVehicleAlertLeaderboard(
      summary({
        predictiveMaintenance: batch([
          { entityId: 'v1', success: true, data: prediction({ vehicleId: 'v1', licensePlate: '' }) },
        ]),
      })
    );

    expect(ranked[0].label).toBe('v1');
  });
});

describe('buildMaintenanceCostLeaderboard', () => {
  const rows: MostExpensiveVehicleRow[] = [
    { license_plate: 'AAA-111', totalCost: 900, recordCount: 4 },
    { license_plate: 'BBB-222', totalCost: 1200, recordCount: 2 },
  ];

  it('ranks by total cost descending', () => {
    const ranked = buildMaintenanceCostLeaderboard(rows);
    expect(ranked.map((row) => row.label)).toEqual(['BBB-222', 'AAA-111']);
  });

  it('does not mutate the server-supplied array', () => {
    const snapshot = rows.map((row) => row.license_plate);
    buildMaintenanceCostLeaderboard(rows);
    expect(rows.map((row) => row.license_plate)).toEqual(snapshot);
  });

  it('returns an empty list for null/undefined rather than throwing', () => {
    expect(buildMaintenanceCostLeaderboard(null)).toEqual([]);
    expect(buildMaintenanceCostLeaderboard(undefined)).toEqual([]);
  });
});

describe('buildRepairCountLeaderboard', () => {
  it('ranks by repair count, not by cost', () => {
    const rows: RepairFrequencyByVehicleRow[] = [
      { license_plate: 'AAA-111', count: 9, totalCost: 10 },
      { license_plate: 'BBB-222', count: 2, totalCost: 9999 },
    ];
    expect(buildRepairCountLeaderboard(rows).map((row) => row.label)).toEqual(['AAA-111', 'BBB-222']);
  });
});

// ─── Formatting ────────────────────────────────────────────────────────

describe('formatLeaderboardValue', () => {
  it('returns an em dash for null, undefined and NaN, never "0"', () => {
    expect(formatLeaderboardValue(null, 'count')).toBe(NO_VALUE);
    expect(formatLeaderboardValue(undefined, 'currency')).toBe(NO_VALUE);
    expect(formatLeaderboardValue(Number.NaN, 'score')).toBe(NO_VALUE);
    expect(formatLeaderboardValue(Number.POSITIVE_INFINITY, 'count')).toBe(NO_VALUE);
  });

  it('renders a genuine zero as "0", distinct from the em dash', () => {
    expect(formatLeaderboardValue(0, 'count')).toBe('0');
  });

  it('groups counts and rounds to whole numbers', () => {
    expect(formatLeaderboardValue(1234, 'count')).toBe('1,234');
    expect(formatLeaderboardValue(2.6, 'count')).toBe('3');
  });

  it('formats currency with a symbol', () => {
    expect(formatLeaderboardValue(1200, 'currency')).toContain('1,200');
    expect(formatLeaderboardValue(1200, 'currency')).toMatch(/\$/);
  });

  it('clamps a score into 0-100 for presentation only', () => {
    expect(formatLeaderboardValue(103, 'score')).toBe('100');
    expect(formatLeaderboardValue(-4, 'score')).toBe('0');
    expect(formatLeaderboardValue(72.4, 'score')).toBe('72');
  });
});

describe('formatRankLabel', () => {
  it('marks a tie and leaves a distinct rank unmarked', () => {
    expect(formatRankLabel({ rank: 2, tied: false })).toBe('#2');
    expect(formatRankLabel({ rank: 2, tied: true })).toBe('#2 (tied)');
  });
});

describe('truncateLabel', () => {
  it('leaves a label that fits unchanged', () => {
    expect(truncateLabel('AAA-111')).toBe('AAA-111');
  });

  it('keeps the leading characters and marks the cut', () => {
    // Plates and names are distinguished by their start, so the tail is
    // what gets dropped.
    expect(truncateLabel('ABCDEFGHIJKLMNOPQ', 10)).toBe('ABCDEFGHI…');
  });

  it('never exceeds maxLength', () => {
    expect(truncateLabel('ABCDEFGHIJKLMNOPQ', 10).length).toBe(10);
    expect(truncateLabel('ABCDEF', 1)).toBe('…');
    expect(truncateLabel('ABCDEF', 0)).toBe('');
  });

  it('handles an empty label', () => {
    expect(truncateLabel('')).toBe('');
  });
});

describe('shareOfTotal', () => {
  it('computes a percentage share', () => {
    expect(shareOfTotal(25, 100)).toBe(25);
  });

  it('returns null for a zero total rather than 0%', () => {
    // "0% of nothing" is not a fact about this row, and a bar drawn at
    // 0% implies it was measured.
    expect(shareOfTotal(0, 0)).toBeNull();
  });

  it('returns null for unusable inputs', () => {
    expect(shareOfTotal(Number.NaN, 10)).toBeNull();
    expect(shareOfTotal(1, Number.NaN)).toBeNull();
  });
});
