// tests/unit/fuel/fuel-intelligence-excel.generator.spec.ts
//
// Smoke + structural tests for buildFuelIntelligenceExcelBuffer. exceljs
// runtime behaviour (merged-cell conflicts, invalid sheet references,
// numFmt on a nonexistent column) cannot be caught by tsc alone, so this
// actually builds a workbook -- twice, once from a populated report and
// once from an empty/UNAVAILABLE-heavy one, since that is the shape most
// likely to trip up a generator that assumes data is always present --
// and re-reads it with exceljs to confirm the expected sheets exist.

import ExcelJS from 'exceljs';
import { buildFuelIntelligenceExcelBuffer } from '../../../modules/fuel/reporting/fuel-intelligence-excel.generator';
import type { MonthlyFuelIntelligenceReport } from '../../../modules/fuel/reporting/fuel-intelligence.types';
import { fact, calculated, unavailable } from '../../../modules/fuel/reporting/fuel-intelligence.types';
import { resolveReportPeriod } from '../../../modules/fuel/reporting/fuel-intelligence.utils';

function buildPopulatedReport(): MonthlyFuelIntelligenceReport {
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
        {
          license_plate: 'AFU0079',
          totalCost: fact(300),
          totalLitres: fact(200),
          logCount: fact(10),
          shareOfFleetCostPercent: calculated(30),
          classification: 'high_cost',
        },
      ],
      topVehicleConcentration: calculated({ vehicleCount: 1, costSharePercent: 70 }),
    },
    driverFindings: {
      rows: [
        { driver_id: 'd1', driverName: 'Tendai Moyo', totalCost: fact(600), totalLitres: fact(300), logCount: fact(12), vehicleCount: fact(1) },
      ],
      unassignedCost: fact(400),
      unassignedSharePercent: calculated(40),
      attributionNote: 'Driver attribution is transaction-time.',
    },
    fuelTypeMix: [
      { fuelType: 'Diesel', litres: fact(450), cost: fact(900), percentage: calculated(90) },
      { fuelType: 'Petrol', litres: fact(50), cost: fact(100), percentage: calculated(10) },
    ],
    abnormalFindings: {
      volumeAnomalies: [{ _id: 'a1', license_plate: 'AFU0078', date: '2026-09-15', volume: 120, anomalyScore: 2.4, threshold: 2 }],
      volumeAnomalyBasis: 'Flagged at 2x the vehicle’s own average fill-up volume.',
      vehicleCostSpikes: [
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
    },
    allocationReconciliation: {
      operationalTotal: fact(1000),
      ledgerTotal: fact(950),
      variance: calculated(50),
      variancePercent: calculated(5.3),
      reconciled: false,
      note: 'Operational fuel records and the allocation ledger fuel total differ by 50.00 (5.3%), exceeding the 1% reconciliation threshold.',
    },
    dataQuality: {
      totalLogsInPeriod: 20,
      truncated: false,
      metrics: [
        { label: 'Fuel logs with no driver recorded', affectedCount: 4, totalCount: 20, percent: 20, severity: 'attention', detail: 'detail' },
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
        how: 'Review logs.',
        prevention: 'Set a review trigger.',
        owner: 'Vehicle AFU0078',
        monitor: 'Next period cost.',
        severity: 'urgent',
      },
    ],
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

describe('buildFuelIntelligenceExcelBuffer', () => {
  it('builds a non-empty, re-readable workbook with all 9 sheets for a populated report', async () => {
    const buffer = await buildFuelIntelligenceExcelBuffer(buildPopulatedReport());
    expect(buffer.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).toEqual([
      '01 Executive Summary',
      '02 Fleet Position & MoM',
      '03 Cost Drivers by Vehicle',
      '04 Driver Fuel Intelligence',
      '05 Fuel Type Mix',
      '06 Abnormal & Exceptions',
      '07 Financial Reconciliation',
      '08 Data Quality',
      '09 Findings & Actions',
    ]);
  });

  it('never throws for an empty/UNAVAILABLE-heavy report, and still produces all sheets', async () => {
    const buffer = await buildFuelIntelligenceExcelBuffer(buildEmptyReport());
    expect(buffer.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets).toHaveLength(9);
  });

  it('renders UNAVAILABLE cells as readable text, never as a blank or fabricated 0', async () => {
    const buffer = await buildFuelIntelligenceExcelBuffer(buildEmptyReport());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const summary = wb.getWorksheet('01 Executive Summary')!;
    const totalCostCell = summary.getCell('B8').value as string;
    expect(totalCostCell).toMatch(/Unavailable/);
  });

  it('applies frozen header + autofilter to the cost drivers sheet', async () => {
    const buffer = await buildFuelIntelligenceExcelBuffer(buildPopulatedReport());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('03 Cost Drivers by Vehicle')!;
    expect(ws.views?.[0]?.state).toBe('frozen');
    expect(ws.autoFilter).toBeTruthy();
  });
});
