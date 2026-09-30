// tests/unit/fuel/monthly-fuel-intelligence.service.spec.ts
//
// Orchestration tests for MonthlyFuelIntelligenceService: does it call
// the existing, already-scoped repository methods correctly and wire
// their results into the report shape, including UNAVAILABLE handling
// for an empty period and the allocation-reconciliation finding. The
// underlying classification/labeling math itself is covered by
// fuel-intelligence.utils.spec.ts; this file is about the wiring.

import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { allocationLedgerRepository } from '@/modules/finance/repositories/allocation-ledger.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

jest.mock('@/modules/fuel/repositories/fuel.repository', () => ({
  fuelRepository: {
    getFuelStats: jest.fn(),
    getFuelingFrequencyByVehicle: jest.fn(),
    getFuelByDriver: jest.fn(),
    getFuelByAssignedDriver: jest.fn(),
    getFuelTypeDistribution: jest.fn(),
    getAbnormalConsumption: jest.fn(),
    getFilteredLogsForExport: jest.fn(),
  },
}));
jest.mock('@/modules/finance/repositories/allocation-ledger.repository', () => ({
  allocationLedgerRepository: {
    getNetTotalsGrouped: jest.fn(),
  },
}));

import { monthlyFuelIntelligenceService } from '../../../modules/fuel/reporting/monthly-fuel-intelligence.service';

const mockedFuel = fuelRepository as jest.Mocked<typeof fuelRepository>;
const mockedLedger = allocationLedgerRepository as jest.Mocked<typeof allocationLedgerRepository>;

const context: TenantContext = {
  organizationId: 'org-1',
  organizationName: 'Willsgrove Farm Enterprises',
  accessibleOrgUnitIds: null,
  isPlatformScope: false,
} as TenantContext;

const EMPTY_STATS = { totalFuel: 0, totalCost: 0, averageCostPerUnit: 0, logCount: 0, efficiency: null, paymentBreakdown: [] };
const EMPTY_EXPORT = { rows: [], totalMatched: 0, truncated: false, exportCap: 50000 };

function mockAllEmpty() {
  mockedFuel.getFuelStats.mockResolvedValue(EMPTY_STATS as never);
  mockedFuel.getFuelingFrequencyByVehicle.mockResolvedValue([]);
  mockedFuel.getFuelByDriver.mockResolvedValue([]);
  mockedFuel.getFuelByAssignedDriver.mockResolvedValue([]);
  mockedFuel.getFuelTypeDistribution.mockResolvedValue([]);
  mockedFuel.getAbnormalConsumption.mockResolvedValue([]);
  mockedFuel.getFilteredLogsForExport.mockResolvedValue(EMPTY_EXPORT as never);
  mockedLedger.getNetTotalsGrouped.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MonthlyFuelIntelligenceService.buildReport -- empty period', () => {
  it('reports UNAVAILABLE (not fabricated zeros) for an empty fleet/period, and never throws', async () => {
    mockAllEmpty();

    const report = await monthlyFuelIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(report.period.month).toBe('2026-09');
    expect(report.fleetPosition.totalFuelCost.status).toBe('UNAVAILABLE');
    expect(report.fleetPosition.logCount).toEqual({ status: 'FACT', value: 0 });
    expect(report.dataQuality.overallAssessment).toBe('insufficient_data');
    expect(report.costDrivers.rows).toEqual([]);
    // No fuel logs -> operational total is UNAVAILABLE (not a fabricated
    // 0), so reconciliation cannot proceed and reports `reconciled: null`
    // rather than a false "not reconciled" verdict.
    expect(report.allocationReconciliation.operationalTotal.status).toBe('UNAVAILABLE');
    expect(report.allocationReconciliation.reconciled).toBeNull();
    // Current-assignment ("Vehicle Hub coverage") lens is UNAVAILABLE too
    // for an empty period, same as the transaction-time figures -- never
    // a fabricated 0.
    expect(report.driverFindings.currentAssignmentUnassignedCost.status).toBe('UNAVAILABLE');
    expect(report.driverFindings.currentAssignmentUnassignedSharePercent.status).toBe('UNAVAILABLE');
    expect(report.driverFindings.currentAssignmentNote).toMatch(/live snapshot/);
  });

  it('passes the resolved period start/end through to every scoped repository call', async () => {
    mockAllEmpty();
    await monthlyFuelIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(mockedFuel.getFuelStats).toHaveBeenCalledWith(
      'org-1',
      { startDate: new Date('2026-09-01T00:00:00.000Z'), endDate: new Date('2026-09-30T23:59:59.999Z') },
      undefined,
      context
    );
  });

  it('never calls a repository method with only a tenantId where a TenantContext is available -- context is always threaded through', async () => {
    mockAllEmpty();
    await monthlyFuelIntelligenceService.buildReport('org-1', context, '2026-09');

    for (const call of mockedFuel.getFuelStats.mock.calls) {
      expect(call).toContain(context);
    }
    for (const call of mockedFuel.getFuelByAssignedDriver.mock.calls) {
      expect(call).toContain(context);
    }
    for (const call of mockedLedger.getNetTotalsGrouped.mock.calls) {
      expect(call).toContain(context);
    }
  });
});

describe('MonthlyFuelIntelligenceService.buildReport -- populated period', () => {
  it('builds a coherent fleet position and cost-driver ranking from repository data', async () => {
    mockAllEmpty();
    mockedFuel.getFuelStats.mockImplementation(async (_t, dateRange) => {
      const isCurrent = (dateRange as { startDate: Date })?.startDate?.getUTCMonth() === 8; // September (0-based)
      return isCurrent
        ? { totalFuel: 500, totalCost: 1000, averageCostPerUnit: 2, logCount: 20, efficiency: null, paymentBreakdown: [] }
        : { totalFuel: 400, totalCost: 700, averageCostPerUnit: 1.75, logCount: 15, efficiency: null, paymentBreakdown: [] };
    });
    mockedFuel.getFuelingFrequencyByVehicle.mockImplementation(async (_t, dateRange) => {
      const isCurrent = (dateRange as { startDate: Date })?.startDate?.getUTCMonth() === 8;
      return isCurrent
        ? [
            { license_plate: 'AFU0078', count: 10, totalVolume: 300, totalCost: 700 },
            { license_plate: 'AFU0079', count: 10, totalVolume: 200, totalCost: 300 },
          ]
        : [
            { license_plate: 'AFU0078', count: 8, totalVolume: 250, totalCost: 500 },
            { license_plate: 'AFU0079', count: 7, totalVolume: 150, totalCost: 200 },
          ];
    });
    mockedLedger.getNetTotalsGrouped.mockResolvedValue([
      { key: null, reportingCurrency: 'USD', netReportingAmount: 1000, postingCount: 20 },
    ]);

    const report = await monthlyFuelIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(report.fleetPosition.totalFuelCost).toEqual({ status: 'FACT', value: 1000 });
    expect(report.fleetPosition.vehiclesActive).toEqual({ status: 'FACT', value: 2 });
    expect(report.costDrivers.rows).toHaveLength(2);
    expect(report.costDrivers.rows[0].license_plate).toBe('AFU0078'); // higher cost, sorted first
    expect(report.allocationReconciliation.reconciled).toBe(true); // 1000 vs 1000
    expect(report.whatChanged.hasComparisonPeriod).toBe(true);
    const costMetric = report.whatChanged.metrics.find((m) => m.label === 'Total fuel cost')!;
    expect(costMetric.direction).toBe('up');
    expect(costMetric.delta).toEqual({ status: 'CALCULATED', value: 300 });
  });

  it('computes the current-assignment ("Vehicle Hub coverage") unassigned share independently from the transaction-time one, and never merges the two', async () => {
    mockAllEmpty();
    mockedFuel.getFuelStats.mockResolvedValue({
      totalFuel: 500,
      totalCost: 1000,
      averageCostPerUnit: 2,
      logCount: 20,
      efficiency: null,
      paymentBreakdown: [],
    } as never);
    // Transaction-time: half the cost has no driver_id recorded at entry.
    mockedFuel.getFuelByDriver.mockResolvedValue([
      { driver_id: 'drv-1', driverName: 'Tendai Moyo', totalFuel: 250, totalCost: 500, logCount: 10, vehicleCount: 1 },
      { driver_id: null, driverName: 'Unassigned', totalFuel: 250, totalCost: 500, logCount: 10, vehicleCount: 1 },
    ] as never);
    // Current-assignment: only a fifth of cost sits with a vehicle that
    // currently has no Hub driver -- a deliberately DIFFERENT figure from
    // the transaction-time one above, to prove the two lenses never get
    // conflated.
    mockedFuel.getFuelByAssignedDriver.mockResolvedValue([
      { driver_id: 'drv-1', driverName: 'Tendai Moyo', totalFuel: 400, totalCost: 800, logCount: 16, vehicleCount: 1 },
      { driver_id: null, driverName: 'Unassigned', totalFuel: 100, totalCost: 200, logCount: 4, vehicleCount: 1 },
    ] as never);

    const report = await monthlyFuelIntelligenceService.buildReport('org-1', context, '2026-09');

    // Transaction-time figures unchanged by the presence of the new lens.
    expect(report.driverFindings.unassignedCost).toEqual({ status: 'FACT', value: 500 });
    expect(report.driverFindings.unassignedSharePercent).toEqual({ status: 'CALCULATED', value: 50 });

    // Current-assignment figures computed from the separate repository call.
    expect(report.driverFindings.currentAssignmentUnassignedCost).toEqual({ status: 'FACT', value: 200 });
    expect(report.driverFindings.currentAssignmentUnassignedSharePercent).toEqual({ status: 'CALCULATED', value: 20 });
    expect(report.driverFindings.currentAssignmentNote).toMatch(/live snapshot/);
    expect(report.driverFindings.attributionNote).toMatch(/PART 4|permanent audit trail/);

    // getFuelByAssignedDriver was called with the same period/scope
    // discipline as every other repository read.
    expect(mockedFuel.getFuelByAssignedDriver).toHaveBeenCalledWith(
      'org-1',
      { startDate: new Date('2026-09-01T00:00:00.000Z'), endDate: new Date('2026-09-30T23:59:59.999Z') },
      2000,
      'cost',
      undefined,
      context
    );

    // The "unassigned driver cost share" finding (>=20% threshold) fires
    // off the transaction-time share and appends current-assignment
    // context rather than substituting it.
    const unassignedFinding = report.findings.find((f) => f.what.includes('no driver recorded at the moment of entry'));
    expect(unassignedFinding).toBeDefined();
    expect(unassignedFinding!.why).toMatch(/20% of this period's fuel cost sits with a vehicle that currently has no Hub driver assigned/);
  });

  it('flags a material allocation variance as a finding', async () => {
    mockAllEmpty();
    mockedFuel.getFuelStats.mockResolvedValue({ totalFuel: 100, totalCost: 1000, averageCostPerUnit: 10, logCount: 5, efficiency: null, paymentBreakdown: [] } as never);
    mockedLedger.getNetTotalsGrouped.mockResolvedValue([
      { key: null, reportingCurrency: 'USD', netReportingAmount: 500, postingCount: 5 },
    ]);

    const report = await monthlyFuelIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(report.allocationReconciliation.reconciled).toBe(false);
    const reconciliationFinding = report.findings.find((f) => f.what.includes('do not reconcile'));
    expect(reconciliationFinding).toBeDefined();
    expect(reconciliationFinding!.severity).toBe('urgent');
  });

  it('treats multiple ledger currencies as unavailable rather than silently summing them', async () => {
    mockAllEmpty();
    mockedFuel.getFuelStats.mockResolvedValue({ totalFuel: 100, totalCost: 1000, averageCostPerUnit: 10, logCount: 5, efficiency: null, paymentBreakdown: [] } as never);
    mockedLedger.getNetTotalsGrouped.mockResolvedValue([
      { key: null, reportingCurrency: 'USD', netReportingAmount: 500, postingCount: 3 },
      { key: null, reportingCurrency: 'ZWG', netReportingAmount: 200000, postingCount: 2 },
    ]);

    const report = await monthlyFuelIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(report.allocationReconciliation.ledgerTotal.status).toBe('UNAVAILABLE');
    expect(report.allocationReconciliation.note).toMatch(/different reporting currencies/);
  });
});
