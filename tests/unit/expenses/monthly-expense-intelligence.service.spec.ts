// tests/unit/expenses/monthly-expense-intelligence.service.spec.ts
//
// Orchestration tests for MonthlyExpenseIntelligenceService: does it call
// the existing, already-scoped repository methods correctly and wire
// their results into the report shape, including UNAVAILABLE handling
// for an empty period and the allocation-reconciliation finding. Mirrors
// tests/unit/fuel/monthly-fuel-intelligence.service.spec.ts's coverage
// and style. The underlying classification/labeling math itself is
// covered by expense-intelligence.utils.spec.ts; this file is about the
// wiring -- and, specifically, about proving there is no driver-related
// wiring at all (the deliberate scope decision this report's header
// documents).

import { expenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { allocationLedgerRepository } from '@/modules/finance/repositories/allocation-ledger.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

jest.mock('@/modules/expenses/repositories/expense.repository', () => ({
  expenseRepository: {
    getExpenseStats: jest.fn(),
    getTopVehiclesByExpense: jest.fn(),
    getExpenseCategorySummary: jest.fn(),
    getExpenseOutliers: jest.fn(),
    getFilteredExpensesForExport: jest.fn(),
  },
}));
jest.mock('@/modules/finance/repositories/allocation-ledger.repository', () => ({
  allocationLedgerRepository: {
    getNetTotalsGrouped: jest.fn(),
  },
}));

import { monthlyExpenseIntelligenceService } from '../../../modules/expenses/reporting/monthly-expense-intelligence.service';

const mockedExpense = expenseRepository as jest.Mocked<typeof expenseRepository>;
const mockedLedger = allocationLedgerRepository as jest.Mocked<typeof allocationLedgerRepository>;

const context: TenantContext = {
  organizationId: 'org-1',
  organizationName: 'Willsgrove Farm Enterprises',
  accessibleOrgUnitIds: null,
  isPlatformScope: false,
} as TenantContext;

const EMPTY_STATS = { total: 0, average: 0, byType: {}, byMonth: {}, topCategories: [] };
const EMPTY_EXPORT = { rows: [], totalMatched: 0, truncated: false, exportCap: 50000 };

function mockAllEmpty() {
  mockedExpense.getExpenseStats.mockResolvedValue(EMPTY_STATS as never);
  mockedExpense.getTopVehiclesByExpense.mockResolvedValue([]);
  mockedExpense.getExpenseCategorySummary.mockResolvedValue([]);
  mockedExpense.getExpenseOutliers.mockResolvedValue([]);
  mockedExpense.getFilteredExpensesForExport.mockResolvedValue(EMPTY_EXPORT as never);
  mockedLedger.getNetTotalsGrouped.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MonthlyExpenseIntelligenceService.buildReport -- empty period', () => {
  it('reports UNAVAILABLE (not fabricated zeros) for an empty fleet/period, and never throws', async () => {
    mockAllEmpty();

    const report = await monthlyExpenseIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(report.period.month).toBe('2026-09');
    expect(report.expensePosition.totalExpenseCost.status).toBe('UNAVAILABLE');
    expect(report.expensePosition.transactionCount).toEqual({ status: 'FACT', value: 0 });
    expect(report.dataQuality.overallAssessment).toBe('insufficient_data');
    expect(report.costDrivers.rows).toEqual([]);
    // No expenses -> operational total is UNAVAILABLE (not a fabricated
    // 0), so reconciliation cannot proceed and reports `reconciled: null`
    // rather than a false "not reconciled" verdict.
    expect(report.allocationReconciliation.operationalTotal.status).toBe('UNAVAILABLE');
    expect(report.allocationReconciliation.reconciled).toBeNull();
  });

  it('passes the resolved period start/end through to every scoped repository call', async () => {
    mockAllEmpty();
    await monthlyExpenseIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(mockedExpense.getExpenseStats).toHaveBeenCalledWith(
      'org-1',
      { startDate: new Date('2026-09-01T00:00:00.000Z'), endDate: new Date('2026-09-30T23:59:59.999Z') },
      undefined,
      context
    );
  });

  it('never calls a repository method with only a tenantId where a TenantContext is available -- context is always threaded through', async () => {
    mockAllEmpty();
    await monthlyExpenseIntelligenceService.buildReport('org-1', context, '2026-09');

    for (const call of mockedExpense.getExpenseStats.mock.calls) {
      expect(call).toContain(context);
    }
    for (const call of mockedLedger.getNetTotalsGrouped.mock.calls) {
      expect(call).toContain(context);
    }
  });

  it('calls allocationLedgerRepository.getNetTotalsGrouped scoped to the "expense" cost category, never "fuel"', async () => {
    mockAllEmpty();
    await monthlyExpenseIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(mockedLedger.getNetTotalsGrouped).toHaveBeenCalledWith(
      'none',
      ['expense'],
      expect.any(Date),
      expect.any(Date),
      context
    );
  });
});

describe('MonthlyExpenseIntelligenceService.buildReport -- populated period', () => {
  it('builds a coherent expense position and cost-driver ranking from repository data', async () => {
    mockAllEmpty();
    mockedExpense.getExpenseStats.mockImplementation(async (_t, dateRange) => {
      const isCurrent = (dateRange as { startDate: Date })?.startDate?.getUTCMonth() === 8; // September (0-based)
      return isCurrent
        ? { total: 1000, average: 100, byType: {}, byMonth: {}, topCategories: [] }
        : { total: 700, average: 87.5, byType: {}, byMonth: {}, topCategories: [] };
    });
    mockedExpense.getTopVehiclesByExpense.mockImplementation(async (_t, dateRange) => {
      const isCurrent = (dateRange as { startDate: Date })?.startDate?.getUTCMonth() === 8;
      return isCurrent
        ? [
            { license_plate: 'AFU0078', totalAmount: 700, expenseCount: 10, topCategory: 'Repairs', average: 70, min: 10, max: 200, latestDate: '2026-09-15', momChangePercent: null },
            { license_plate: 'AFU0079', totalAmount: 300, expenseCount: 10, topCategory: 'Tyres', average: 30, min: 5, max: 100, latestDate: '2026-09-10', momChangePercent: null },
          ]
        : [
            { license_plate: 'AFU0078', totalAmount: 500, expenseCount: 8, topCategory: 'Repairs', average: 62.5, min: 10, max: 150, latestDate: '2026-08-20', momChangePercent: null },
            { license_plate: 'AFU0079', totalAmount: 200, expenseCount: 7, topCategory: 'Tyres', average: 28.5, min: 5, max: 80, latestDate: '2026-08-18', momChangePercent: null },
          ];
    });
    mockedLedger.getNetTotalsGrouped.mockResolvedValue([
      { key: null, reportingCurrency: 'USD', netReportingAmount: 1000, postingCount: 20 },
    ]);

    const report = await monthlyExpenseIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(report.expensePosition.totalExpenseCost).toEqual({ status: 'FACT', value: 1000 });
    expect(report.expensePosition.vehiclesWithExpenses).toEqual({ status: 'FACT', value: 2 });
    expect(report.expensePosition.transactionCount).toEqual({ status: 'FACT', value: 20 });
    expect(report.costDrivers.rows).toHaveLength(2);
    expect(report.costDrivers.rows[0].license_plate).toBe('AFU0078'); // higher cost, sorted first
    expect(report.allocationReconciliation.reconciled).toBe(true); // 1000 vs 1000
    expect(report.whatChanged.hasComparisonPeriod).toBe(true);
    const costMetric = report.whatChanged.metrics.find((m) => m.label === 'Total expense cost')!;
    expect(costMetric.direction).toBe('up');
    expect(costMetric.delta).toEqual({ status: 'CALCULATED', value: 300 });
  });

  it('flags a material allocation variance as a finding', async () => {
    mockAllEmpty();
    mockedExpense.getExpenseStats.mockResolvedValue({ total: 1000, average: 200, byType: {}, byMonth: {}, topCategories: [] } as never);
    mockedExpense.getTopVehiclesByExpense.mockResolvedValue([
      { license_plate: 'AFU0078', totalAmount: 1000, expenseCount: 5, topCategory: 'Repairs', average: 200, min: 50, max: 400, latestDate: '2026-09-10', momChangePercent: null },
    ] as never);
    mockedLedger.getNetTotalsGrouped.mockResolvedValue([
      { key: null, reportingCurrency: 'USD', netReportingAmount: 500, postingCount: 5 },
    ]);

    const report = await monthlyExpenseIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(report.allocationReconciliation.reconciled).toBe(false);
    const reconciliationFinding = report.findings.find((f) => f.what.includes('do not reconcile'));
    expect(reconciliationFinding).toBeDefined();
    expect(reconciliationFinding!.severity).toBe('urgent');
  });

  it('treats multiple ledger currencies as unavailable rather than silently summing them', async () => {
    mockAllEmpty();
    mockedExpense.getExpenseStats.mockResolvedValue({ total: 1000, average: 200, byType: {}, byMonth: {}, topCategories: [] } as never);
    mockedExpense.getTopVehiclesByExpense.mockResolvedValue([
      { license_plate: 'AFU0078', totalAmount: 1000, expenseCount: 5, topCategory: 'Repairs', average: 200, min: 50, max: 400, latestDate: '2026-09-10', momChangePercent: null },
    ] as never);
    mockedLedger.getNetTotalsGrouped.mockResolvedValue([
      { key: null, reportingCurrency: 'USD', netReportingAmount: 500, postingCount: 3 },
      { key: null, reportingCurrency: 'ZWG', netReportingAmount: 200000, postingCount: 2 },
    ]);

    const report = await monthlyExpenseIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(report.allocationReconciliation.ledgerTotal.status).toBe('UNAVAILABLE');
    expect(report.allocationReconciliation.note).toMatch(/different reporting currencies/);
  });

  it('surfaces flagged amount outliers from getExpenseOutliers in Abnormal Findings, unmodified', async () => {
    mockAllEmpty();
    mockedExpense.getExpenseOutliers.mockResolvedValue([
      { _id: 'exp-1', license_plate: 'AFU0078', category: 'Repairs', amount: 950, date: '2026-09-12T00:00:00.000Z', categoryMean: 100, categoryStdDev: 20, zScore: 4.25 },
    ] as never);

    const report = await monthlyExpenseIntelligenceService.buildReport('org-1', context, '2026-09');

    expect(report.abnormalFindings.amountOutliers).toHaveLength(1);
    expect(report.abnormalFindings.amountOutliers[0].license_plate).toBe('AFU0078');
    expect(report.abnormalFindings.amountOutliers[0].zScore).toBe(4.25);
    const outlierFinding = report.findings.find((f) => f.what.includes('statistical outliers'));
    expect(outlierFinding).toBeDefined();
  });
});

describe('MonthlyExpenseIntelligenceService.buildReport -- no driver section', () => {
  it('the report shape has no driverFindings field at all', async () => {
    mockAllEmpty();
    const report = await monthlyExpenseIntelligenceService.buildReport('org-1', context, '2026-09');
    expect(report).not.toHaveProperty('driverFindings');
  });

  it('never calls a driver-resolution repository method -- expenses have no driver_id/currentDriverId concept in this report', async () => {
    mockAllEmpty();
    await monthlyExpenseIntelligenceService.buildReport('org-1', context, '2026-09');

    // Only the methods this service is wired to are ever invoked --
    // proven by the jest.mock() factory above declaring exactly this
    // set. This test documents the intent explicitly so a future change
    // that adds a driver-resolution call has to touch this assertion,
    // not silently pass.
    const calledMethods = Object.keys(mockedExpense).filter(
      (key) => (mockedExpense[key as keyof typeof mockedExpense] as jest.Mock).mock.calls.length > 0
    );
    expect(calledMethods.sort()).toEqual(
      ['getExpenseCategorySummary', 'getExpenseOutliers', 'getExpenseStats', 'getFilteredExpensesForExport', 'getTopVehiclesByExpense'].sort()
    );
  });
});
