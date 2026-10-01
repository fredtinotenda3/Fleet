// tests/unit/expenses/expense-intelligence-pdf.generator.spec.ts
//
// Smoke tests for buildExpenseIntelligencePdfBuffer -- mirrors
// tests/unit/fuel/fuel-intelligence-pdf.generator.spec.ts's approach
// exactly: confirms the pdfkit document actually completes (no thrown
// layout error, no infinite page-flow loop) for both a data-rich report
// and an empty/UNAVAILABLE one, produces a well-formed PDF (starts with
// the %PDF- magic bytes), and never balloons in page count from the
// footer-stamping loop (see that generator's header for the regression
// this guards against).

import { buildExpenseIntelligencePdfBuffer, fmtPercent } from '../../../modules/expenses/reporting/expense-intelligence-pdf.generator';
import type { MonthlyExpenseIntelligenceReport, Finding } from '../../../modules/expenses/reporting/expense-intelligence.types';
import { fact, calculated, unavailable } from '../../../modules/expenses/reporting/expense-intelligence.types';
import { resolveReportPeriod } from '../../../modules/expenses/reporting/expense-intelligence.utils';

// Same /Count-reading technique as the fuel PDF generator's spec -- see
// that file's header comment for why this is read instead of a text
// search (page content streams are FlateDecode-compressed).
function pageCount(buf: Buffer): number {
  const match = /\/Type\s*\/Pages.*?\/Count\s+(\d+)/s.exec(buf.toString('latin1'));
  if (!match) throw new Error('Could not find /Count in the generated PDF -- pdfkit output format may have changed.');
  return Number(match[1]);
}

function manyFindings(count: number): Finding[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `f${i}`,
    what: `Finding number ${i} describing a fleet expense observation in enough detail to wrap across multiple lines of the PDF page.`,
    why: 'This matters because it affects fleet cost visibility and management decision-making for the period under review.',
    impact: fact(`${100 + i} this period.`),
    action: 'Investigate and correct as appropriate.',
    how: 'Review the underlying expense transactions and cross-reference against vehicle records.',
    prevention: 'Establish a recurring monthly check for this condition.',
    owner: i % 2 === 0 ? `Vehicle V${i}` : undefined,
    monitor: `Recheck this metric next month for vehicle V${i}.`,
    severity: i % 3 === 0 ? 'urgent' : i % 3 === 1 ? 'attention' : 'info',
  }));
}

function buildReport(overrides: Partial<MonthlyExpenseIntelligenceReport> = {}): MonthlyExpenseIntelligenceReport {
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
      ],
      topVehicleConcentration: calculated({ vehicleCount: 1, costSharePercent: 70 }),
    },
    categoryMix: [
      { category: 'Repairs', cost: fact(900), count: fact(15), percentage: calculated(90), momChangePercent: calculated(12.5) },
    ],
    abnormalFindings: {
      amountOutliers: [
        { _id: 'a1', license_plate: 'AFU0078', category: 'Repairs', date: '2026-09-15', amount: 450, categoryMean: 120, categoryStdDev: 40, zScore: 8.25 },
      ],
      outlierBasis: 'Flagged at 2.5 standard deviations from the category mean.',
      vehicleCostSpikes: [],
    },
    allocationReconciliation: {
      operationalTotal: fact(1000),
      ledgerTotal: fact(950),
      variance: calculated(50),
      variancePercent: calculated(5.3),
      reconciled: false,
      note: 'Operational expense records and the allocation ledger expense total differ.',
    },
    dataQuality: {
      totalTransactionsInPeriod: 20,
      truncated: false,
      metrics: [{ label: 'Expenses with no category recorded', affectedCount: 4, totalCount: 20, percent: 20, severity: 'attention', detail: 'detail' }],
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
    ...overrides,
  };
}

// Mirrors the fuel PDF spec's buildFullDataReport: a report shaped like
// the real one, with more cost-driver rows than the top-10 cap, a
// populated category mix, and a flagged vehicle-level cost spike, so
// every code path (Category Mix, the "+N more" overflow disclosure, and
// the cost-spikes subsection) runs in the same call.
function buildFullDataReport(): MonthlyExpenseIntelligenceReport {
  const base = buildReport();
  const manyCostDriverRows = Array.from({ length: 14 }, (_, i) => ({
    license_plate: `PLT${i}`,
    totalCost: fact(1000 - i * 10),
    transactionCount: fact(5),
    shareOfFleetCostPercent: calculated(5),
    classification: 'normal' as const,
  }));
  return {
    ...base,
    costDrivers: { rows: manyCostDriverRows, topVehicleConcentration: calculated({ vehicleCount: 5, costSharePercent: 61.4 }) },
    categoryMix: [
      { category: 'Repairs', cost: fact(35025.54), count: fact(120), percentage: calculated(94.8), momChangePercent: calculated(8.1) },
      { category: 'Tyres', cost: fact(1912.27), count: fact(18), percentage: calculated(5.2), momChangePercent: unavailable('No comparable prior-period data for this category.') },
    ],
    abnormalFindings: {
      amountOutliers: base.abnormalFindings.amountOutliers,
      outlierBasis: base.abnormalFindings.outlierBasis,
      vehicleCostSpikes: [
        {
          license_plate: 'PLT0',
          totalCost: fact(990),
          transactionCount: fact(5),
          shareOfFleetCostPercent: calculated(5),
          classification: 'abnormal_cost',
          abnormalReason: 'Cost rose sharply vs. prior period.',
        },
      ],
    },
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

describe('buildExpenseIntelligencePdfBuffer', () => {
  it('produces a well-formed, non-empty PDF for a populated report', async () => {
    const buffer = await buildExpenseIntelligencePdfBuffer(buildReport());
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.subarray(-6).toString('latin1').includes('%%EOF')).toBe(true);
  });

  it('never throws for an empty/UNAVAILABLE-heavy report', async () => {
    const buffer = await buildExpenseIntelligencePdfBuffer(buildEmptyReport());
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('completes correctly (page numbers applied without error) when findings overflow onto multiple pages', async () => {
    const buffer = await buildExpenseIntelligencePdfBuffer(buildReport({ findings: manyFindings(40) }));
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  // Regression coverage, mirroring the fuel PDF generator's own: the
  // footer-stamping loop must not draw inside the bottom margin in a way
  // that triggers pdfkit's page-break-if-needed check and silently
  // appends a blank page per footer .text() call.
  it('does not balloon in page count when stamping footers (short report)', async () => {
    const buffer = await buildExpenseIntelligencePdfBuffer(buildReport());
    expect(pageCount(buffer)).toBeLessThanOrEqual(3);
  });

  it('does not balloon in page count when stamping footers (report overflowing many pages)', async () => {
    const buffer = await buildExpenseIntelligencePdfBuffer(buildReport({ findings: manyFindings(40) }));
    expect(pageCount(buffer)).toBeLessThanOrEqual(15);
  });

  it('renders without error and stays page-bounded for a full, multi-section report (Category Mix, cost-spikes, and >10-row overflow disclosures all present)', async () => {
    const buffer = await buildExpenseIntelligencePdfBuffer(buildFullDataReport());
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pageCount(buffer)).toBeLessThanOrEqual(4);
  });
});

describe('fmtPercent', () => {
  it('rounds floating-point division artifacts to one decimal place', () => {
    expect(fmtPercent(5500 / 35251.81 * 100)).toBe('15.6%');
    expect(fmtPercent(15.600000000000001)).toBe('15.6%');
  });

  it('formats whole numbers without spurious decimals beyond the fixed precision', () => {
    expect(fmtPercent(70)).toBe('70.0%');
    expect(fmtPercent(0)).toBe('0.0%');
  });
});
