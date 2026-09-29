// tests/unit/fuel/fuel-intelligence-pdf.generator.spec.ts
//
// Smoke tests for buildFuelIntelligencePdfBuffer -- confirms the pdfkit
// document actually completes (no thrown layout error, no infinite
// page-flow loop) for both a data-rich report and an empty/UNAVAILABLE
// one, and produces a well-formed PDF (starts with the %PDF- magic
// bytes) with more than one page's worth of content for the populated
// case. Reuses the same two fixtures as the Excel generator's smoke
// test via a small local builder to avoid a cross-file dependency
// between two independent test suites.

import { buildFuelIntelligencePdfBuffer, fmtPercent } from '../../../modules/fuel/reporting/fuel-intelligence-pdf.generator';
import type { MonthlyFuelIntelligenceReport, Finding } from '../../../modules/fuel/reporting/fuel-intelligence.types';
import { fact, calculated, unavailable } from '../../../modules/fuel/reporting/fuel-intelligence.types';
import { resolveReportPeriod } from '../../../modules/fuel/reporting/fuel-intelligence.utils';

// pdfkit writes the document's true page count in the (uncompressed)
// /Pages object's /Count entry -- unlike the rendered text itself,
// which lives inside FlateDecode-compressed content streams and isn't
// readable with a plain substring search. Reading /Count is what lets
// the regression tests below catch a recurrence of the "every footer
// draw silently appends a blank page" bug without needing a full PDF
// text-extraction library.
function pageCount(buf: Buffer): number {
  const match = /\/Type\s*\/Pages.*?\/Count\s+(\d+)/s.exec(buf.toString('latin1'));
  if (!match) throw new Error('Could not find /Count in the generated PDF -- pdfkit output format may have changed.');
  return Number(match[1]);
}

function manyFindings(count: number): Finding[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `f${i}`,
    what: `Finding number ${i} describing a fleet fuel observation in enough detail to wrap across multiple lines of the PDF page.`,
    why: 'This matters because it affects fleet cost visibility and management decision-making for the period under review.',
    impact: fact(`${100 + i} this period.`),
    action: 'Investigate and correct as appropriate.',
    how: 'Review the underlying fuel logs and cross-reference against vehicle assignment records.',
    prevention: 'Establish a recurring monthly check for this condition.',
    owner: i % 2 === 0 ? `Vehicle V${i}` : undefined,
    monitor: `Recheck this metric next month for vehicle V${i}.`,
    severity: i % 3 === 0 ? 'urgent' : i % 3 === 1 ? 'attention' : 'info',
  }));
}

function buildReport(overrides: Partial<MonthlyFuelIntelligenceReport> = {}): MonthlyFuelIntelligenceReport {
  const period = resolveReportPeriod('2026-09');
  return {
    organization: { id: 'org-1', name: 'Willsgrove Farm Enterprises' },
    scope: { orgUnitId: null },
    generatedAt: new Date('2026-10-01T08:00:00.000Z'),
    period,
    fleetPosition: {
      totalFuelCost: fact(1000),
      totalLitres: fact(500),
      logCount: fact(20),
      vehiclesActive: fact(2),
      averageCostPerLitre: calculated(2),
      currency: 'USD',
    },
    whatChanged: {
      hasComparisonPeriod: true,
      comparisonPeriodLabel: 'August 2026',
      metrics: [
        {
          label: 'Total fuel cost',
          unit: 'currency',
          current: fact(1000),
          previous: fact(700),
          delta: calculated(300),
          deltaPercent: calculated(42.9),
          direction: 'up',
          possibleExplanation: calculated('average price per litre rose 12%'),
        },
      ],
    },
    costDrivers: {
      rows: [
        {
          license_plate: 'AFU0078',
          totalCost: fact(700),
          totalLitres: fact(300),
          logCount: fact(10),
          shareOfFleetCostPercent: calculated(70),
          classification: 'abnormal_cost',
          abnormalReason: 'Cost rose sharply vs. prior period.',
        },
      ],
      topVehicleConcentration: calculated({ vehicleCount: 1, costSharePercent: 70 }),
    },
    driverFindings: {
      rows: [{ driver_id: 'd1', driverName: 'Tendai Moyo', totalCost: fact(600), totalLitres: fact(300), logCount: fact(12), vehicleCount: fact(1) }],
      unassignedCost: fact(400),
      unassignedSharePercent: calculated(40),
      attributionNote: 'Driver attribution is transaction-time.',
    },
    fuelTypeMix: [{ fuelType: 'Diesel', litres: fact(450), cost: fact(900), percentage: calculated(90) }],
    abnormalFindings: {
      volumeAnomalies: [{ _id: 'a1', license_plate: 'AFU0078', date: '2026-09-15', volume: 120, anomalyScore: 2.4, threshold: 2 }],
      volumeAnomalyBasis: 'Flagged at 2x the vehicle’s own average fill-up volume.',
      vehicleCostSpikes: [],
    },
    allocationReconciliation: {
      operationalTotal: fact(1000),
      ledgerTotal: fact(950),
      variance: calculated(50),
      variancePercent: calculated(5.3),
      reconciled: false,
      note: 'Operational fuel records and the allocation ledger fuel total differ.',
    },
    dataQuality: {
      totalLogsInPeriod: 20,
      truncated: false,
      metrics: [{ label: 'Fuel logs with no driver recorded', affectedCount: 4, totalCount: 20, percent: 20, severity: 'attention', detail: 'detail' }],
      overallAssessment: 'fair',
    },
    findings: [
      {
        id: 'finding-1',
        what: 'Vehicle AFU0078 cost spiked.',
        why: 'Sudden increase vs. baseline.',
        impact: fact('700 this period.'),
        action: 'Investigate.',
        how: 'Review logs.',
        prevention: 'Set a review trigger.',
        owner: 'Vehicle AFU0078',
        monitor: 'Next period cost.',
        severity: 'urgent',
      },
    ],
    ...overrides,
  };
}

function buildEmptyReport(): MonthlyFuelIntelligenceReport {
  const period = resolveReportPeriod('2026-01');
  return {
    organization: { id: 'org-1', name: 'Empty Org' },
    scope: { orgUnitId: null },
    generatedAt: new Date('2026-02-01T00:00:00.000Z'),
    period,
    fleetPosition: {
      totalFuelCost: unavailable('No fuel logs recorded for this period.'),
      totalLitres: unavailable('No fuel logs recorded for this period.'),
      logCount: fact(0),
      vehiclesActive: fact(0),
      averageCostPerLitre: unavailable('No litres recorded for this period; a cost-per-litre average is undefined.'),
      currency: 'USD',
    },
    whatChanged: { hasComparisonPeriod: false, metrics: [] },
    costDrivers: { rows: [], topVehicleConcentration: unavailable('No fuel logs recorded for this period.') },
    driverFindings: {
      rows: [],
      unassignedCost: unavailable('No fuel logs recorded for this period.'),
      unassignedSharePercent: unavailable('No fuel cost recorded for this period.'),
      attributionNote: 'note',
    },
    fuelTypeMix: [],
    abnormalFindings: { volumeAnomalies: [], volumeAnomalyBasis: 'basis', vehicleCostSpikes: [] },
    allocationReconciliation: {
      operationalTotal: unavailable('n/a'),
      ledgerTotal: unavailable('n/a'),
      variance: unavailable('n/a'),
      variancePercent: unavailable('n/a'),
      reconciled: null,
      note: 'Reconciliation could not be performed.',
    },
    dataQuality: { totalLogsInPeriod: 0, truncated: false, metrics: [], overallAssessment: 'insufficient_data' },
    findings: [],
  };
}

describe('buildFuelIntelligencePdfBuffer', () => {
  it('produces a well-formed, non-empty PDF for a populated report', async () => {
    const buffer = await buildFuelIntelligencePdfBuffer(buildReport());
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.subarray(-6).toString('latin1').includes('%%EOF')).toBe(true);
  });

  it('never throws for an empty/UNAVAILABLE-heavy report', async () => {
    const buffer = await buildFuelIntelligencePdfBuffer(buildEmptyReport());
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('completes correctly (page numbers applied without error) when findings overflow onto multiple pages', async () => {
    const buffer = await buildFuelIntelligencePdfBuffer(buildReport({ findings: manyFindings(40) }));
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  // Regression coverage for a real defect a director hit in a generated
  // report: the footer-stamping loop drew each page's footer text 20pt
  // below the content area (i.e. inside the bottom margin, where a
  // footer belongs), but pdfkit's automatic page-break-if-needed check
  // treats anything below page.height - margins.bottom as overflow
  // regardless of the explicit y given -- so every footer .text() call
  // silently appended a blank page. A 3-content-page report came out as
  // 9 pages (6 of them blank). The fix zeroes margins.bottom for the
  // duration of the footer draw; these bounds would fail again at
  // roughly 3x if that regressed.
  it('does not balloon in page count when stamping footers (short report)', async () => {
    const buffer = await buildFuelIntelligencePdfBuffer(buildReport());
    expect(pageCount(buffer)).toBeLessThanOrEqual(3);
  });

  it('does not balloon in page count when stamping footers (report overflowing many pages)', async () => {
    const buffer = await buildFuelIntelligencePdfBuffer(buildReport({ findings: manyFindings(40) }));
    // Real content alone puts this fixture at ~10 pages; the pre-fix bug
    // roughly tripled whatever the real count was (2 blank pages added
    // per real page from the footer loop).
    expect(pageCount(buffer)).toBeLessThanOrEqual(15);
  });
});

// Regression coverage for a second real defect in the same report: a
// director-facing PDF showed vehicle cost shares as e.g.
// "15.600000000000001% of fleet cost" -- correct arithmetically
// (ordinary floating-point division), but not something to hand a
// director. Every percentage in this generator now routes through
// fmtPercent, which rounds to one decimal place.
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
