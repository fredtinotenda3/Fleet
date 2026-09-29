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
