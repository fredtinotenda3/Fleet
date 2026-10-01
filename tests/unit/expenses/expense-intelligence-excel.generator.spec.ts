// tests/unit/expenses/expense-intelligence-excel.generator.spec.ts
//
// Smoke + structural tests for buildExpenseIntelligenceExcelBuffer.
// Mirrors tests/unit/fuel/fuel-intelligence-excel.generator.spec.ts's
// approach exactly: exceljs runtime behaviour (merged-cell conflicts,
// invalid sheet references, numFmt on a nonexistent column) cannot be
// caught by tsc alone, so this actually builds a workbook -- twice, once
// from a populated report and once from an empty/UNAVAILABLE-heavy one
// -- and re-reads it with exceljs to confirm the expected sheets exist.
//
// EIGHT sheets, not nine: this report has no driver dimension, so there
// is no "04 Driver Fuel Intelligence" sheet to assert against -- see
// expense-intelligence-excel.generator.ts's header.

import ExcelJS from 'exceljs';
import { buildExpenseIntelligenceExcelBuffer } from '../../../modules/expenses/reporting/expense-intelligence-excel.generator';
import type { MonthlyExpenseIntelligenceReport } from '../../../modules/expenses/reporting/expense-intelligence.types';
import { fact, calculated, unavailable } from '../../../modules/expenses/reporting/expense-intelligence.types';
import { resolveReportPeriod } from '../../../modules/expenses/reporting/expense-intelligence.utils';

function buildPopulatedReport(): MonthlyExpenseIntelligenceReport {
  const period = resolveReportPeriod('2026-09');
  return {
    organization: { id: 'org-1', name: 'Willsgrove Farm Enterprises' },
    scope: { orgUnitId: null },
    generatedAt: new Date('2026-10-01T08:00:00.000Z'),
    period,
    expensePosition: {
      totalExpenseCost: fact(1000),
      transactionCount: fact(20),
      vehiclesWithExpenses: fact(2),
      averageCostPerTransaction: calculated(50),
      currency: 'USD',
    },
    whatChanged: {
      hasComparisonPeriod: true,
      comparisonPeriodLabel: 'August 2026',
      metrics: [
        {
          label: 'Total expense cost',
          unit: 'currency',
          current: fact(1000),
          previous: fact(700),
          delta: calculated(300),
          deltaPercent: calculated(42.9),
          direction: 'up',
          possibleExplanation: calculated('transaction count rose alongside cost'),
        },
      ],
    },
    costDrivers: {
      rows: [
        {
          license_plate: 'AFU0078',
          totalCost: fact(700),
          transactionCount: fact(10),
          shareOfFleetCostPercent: calculated(70),
          classification: 'abnormal_cost',
          abnormalReason: 'Cost rose sharply vs. prior period.',
        },
        {
          license_plate: 'AFU0079',
          totalCost: fact(300),
          transactionCount: fact(10),
          shareOfFleetCostPercent: calculated(30),
          classification: 'high_cost',
        },
      ],
      topVehicleConcentration: calculated({ vehicleCount: 1, costSharePercent: 70 }),
    },
    categoryMix: [
      { category: 'Repairs', cost: fact(900), count: fact(15), percentage: calculated(90), momChangePercent: calculated(12.5) },
      { category: 'Tyres', cost: fact(100), count: fact(5), percentage: calculated(10), momChangePercent: unavailable('No comparable prior-period data for this category.') },
    ],
    abnormalFindings: {
      amountOutliers: [
        { _id: 'a1', license_plate: 'AFU0078', category: 'Repairs', date: '2026-09-15', amount: 450, categoryMean: 120, categoryStdDev: 40, zScore: 8.25 },
      ],
      outlierBasis: 'Flagged at 2.5 standard deviations from the category mean.',
      vehicleCostSpikes: [
        {
          license_plate: 'AFU0078',
          totalCost: fact(700),
          transactionCount: fact(10),
          shareOfFleetCostPercent: calculated(70),
          classification: 'abnormal_cost',
          abnormalReason: 'Cost rose sharply vs. prior period.',
        },
      ],
    },
    allocationReconciliation: {
      operationalTotal: fact(1000),
      ledgerTotal: fact(950),
      variance: calculated(50),
      variancePercent: calculated(5.3),
      reconciled: false,
      note: 'Operational expense records and the allocation ledger expense total differ by 50.00 (5.3%), exceeding the 1% reconciliation threshold.',
    },
    dataQuality: {
      totalTransactionsInPeriod: 20,
      truncated: false,
      metrics: [
        { label: 'Expenses with no category recorded', affectedCount: 4, totalCount: 20, percent: 20, severity: 'attention', detail: 'detail' },
        { label: 'Suspected duplicate entries', affectedCount: 0, totalCount: 20, percent: 0, severity: 'info', detail: 'detail' },
      ],
      overallAssessment: 'fair',
    },
    findings: [
      {
        id: 'finding-1',
        what: 'Vehicle AFU0078 cost spiked.',
        why: 'Sudden increase vs. baseline.',
        impact: fact('700 this period.'),
        action: 'Investigate.',
        how: 'Review transactions.',
        prevention: 'Set a review trigger.',
        owner: 'Vehicle AFU0078',
        monitor: 'Next period cost.',
        severity: 'urgent',
      },
    ],
  };
}

function buildEmptyReport(): MonthlyExpenseIntelligenceReport {
  const period = resolveReportPeriod('2026-01');
  return {
    organization: { id: 'org-1', name: 'Empty Org' },
    scope: { orgUnitId: null },
    generatedAt: new Date('2026-02-01T00:00:00.000Z'),
    period,
    expensePosition: {
      totalExpenseCost: unavailable('No expenses recorded for this period.'),
      transactionCount: fact(0),
      vehiclesWithExpenses: fact(0),
      averageCostPerTransaction: unavailable('No expense transactions recorded for this period; an average is undefined.'),
      currency: 'USD',
    },
    whatChanged: { hasComparisonPeriod: false, metrics: [] },
    costDrivers: { rows: [], topVehicleConcentration: unavailable('No expenses recorded for this period.') },
    categoryMix: [],
    abnormalFindings: { amountOutliers: [], outlierBasis: 'basis', vehicleCostSpikes: [] },
    allocationReconciliation: {
      operationalTotal: unavailable('n/a'),
      ledgerTotal: unavailable('n/a'),
      variance: unavailable('n/a'),
      variancePercent: unavailable('n/a'),
      reconciled: null,
      note: 'Reconciliation could not be performed.',
    },
    dataQuality: { totalTransactionsInPeriod: 0, truncated: false, metrics: [], overallAssessment: 'insufficient_data' },
    findings: [],
  };
}

describe('buildExpenseIntelligenceExcelBuffer', () => {
  it('builds a non-empty, re-readable workbook with all 8 sheets for a populated report', async () => {
    const buffer = await buildExpenseIntelligenceExcelBuffer(buildPopulatedReport());
    expect(buffer.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).toEqual([
      '01 Executive Summary',
      '02 Expense Position & MoM',
      '03 Cost Drivers by Vehicle',
      '04 Category Mix',
      '05 Abnormal & Exceptions',
      '06 Financial Reconciliation',
      '07 Data Quality',
      '08 Findings & Actions',
    ]);
  });

  it('never throws for an empty/UNAVAILABLE-heavy report, and still produces all sheets', async () => {
    const buffer = await buildExpenseIntelligenceExcelBuffer(buildEmptyReport());
    expect(buffer.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets).toHaveLength(8);
  });

  it('renders UNAVAILABLE cells as readable text, never as a blank or fabricated 0', async () => {
    const buffer = await buildExpenseIntelligenceExcelBuffer(buildEmptyReport());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const summary = wb.getWorksheet('01 Executive Summary')!;
    const totalCostCell = summary.getCell('B8').value as string;
    expect(totalCostCell).toMatch(/Unavailable/);
  });

  it('renders the Category Mix MoM column, including an UNAVAILABLE category with no prior-period baseline', async () => {
    const buffer = await buildExpenseIntelligenceExcelBuffer(buildPopulatedReport());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('04 Category Mix')!;
    expect(ws.getCell('A2').value).toBe('Repairs');
    expect(ws.getCell('E2').value).toBe(0.125);
    expect(ws.getCell('A3').value).toBe('Tyres');
    expect(ws.getCell('E3').value as string).toMatch(/Unavailable/);
  });

  it('applies frozen header + autofilter to the cost drivers sheet', async () => {
    const buffer = await buildExpenseIntelligenceExcelBuffer(buildPopulatedReport());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('03 Cost Drivers by Vehicle')!;
    expect(ws.views?.[0]?.state).toBe('frozen');
    expect(ws.autoFilter).toBeTruthy();
  });

  it('lists individual amount outliers with their z-score in the Abnormal & Exceptions sheet', async () => {
    const buffer = await buildExpenseIntelligenceExcelBuffer(buildPopulatedReport());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('05 Abnormal & Exceptions')!;
    expect(ws.getCell('A6').value).toBe('License plate');
    expect(ws.getCell('A7').value).toBe('AFU0078');
    expect(ws.getCell('G7').value).toBe(8.25);
  });
});
