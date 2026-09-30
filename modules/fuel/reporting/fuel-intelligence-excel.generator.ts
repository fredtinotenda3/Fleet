// modules/fuel/reporting/fuel-intelligence-excel.generator.ts
//
// PART 8 ("Professional Excel workbooks, not one giant sheet").
// Renders a MonthlyFuelIntelligenceReport as a multi-sheet .xlsx
// workbook using ExcelJS.
//
// WHY A NEW DEPENDENCY (exceljs): the platform's existing Excel export
// (modules/reporting/generators/excel-report.generator.ts) uses `xlsx`
// (SheetJS). SheeJS's community edition can WRITE cell values but cannot
// apply cell styling, column filters, or frozen header panes -- those
// are Pro-tier-only features. PART 8 explicitly requires bold headers,
// number/currency/percentage formatting, filters and frozen headers,
// none of which are achievable with the dependency already in
// package.json. exceljs (MIT-licensed, actively maintained, ~9M weekly
// downloads) supports all of them natively and is added as a new,
// disclosed dependency for exactly this reason -- see this engagement's
// final report for the explicit call-out. The existing `xlsx`-based
// generator is NOT replaced or touched; this is a new, separate
// generator for a new, separate report, following the same
// "add alongside, never rewrite in place" discipline already established
// in this codebase (e.g. allocation-ledger.repository.ts's
// getNetTotalsGrouped header).

import ExcelJS from 'exceljs';
import type {
  DriverFindingRow,
  Finding,
  Labeled,
  MonthlyFuelIntelligenceReport,
} from './fuel-intelligence.types';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14, color: { argb: 'FF1F3864' } };
const SUBTLE_FONT: Partial<ExcelJS.Font> = { italic: true, color: { argb: 'FF666666' }, size: 9 };
const ISSUE_FILL: Record<string, ExcelJS.Fill> = {
  urgent: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } },
  attention: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } },
  info: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } },
};

function labeledText<T>(l: Labeled<T>, formatter: (v: T) => string = (v) => String(v)): string {
  if (l.status === 'UNAVAILABLE') return `Unavailable${l.reason ? ` — ${l.reason}` : ''}`;
  if (l.value === null) return '—';
  const prefix = l.status === 'ESTIMATED' ? 'Est. ' : l.status === 'DATA_QUALITY_ISSUE' ? '⚠ ' : '';
  return `${prefix}${formatter(l.value)}`;
}

function labeledNumber<T extends number>(l: Labeled<T>): number | string {
  if (l.value === null) return labeledText(l);
  return l.value;
}

function addHeaderSheet(workbook: ExcelJS.Workbook, report: MonthlyFuelIntelligenceReport): void {
  const ws = workbook.addWorksheet('01 Executive Summary', { views: [{ state: 'frozen', ySplit: 0 }] });
  ws.columns = [{ width: 42 }, { width: 60 }];

  ws.mergeCells('A1:B1');
  ws.getCell('A1').value = 'Monthly Fuel & Fleet Intelligence Report';
  ws.getCell('A1').font = TITLE_FONT;

  ws.getCell('A2').value = report.organization.name;
  ws.getCell('A3').value = `Reporting period: ${report.period.label}`;
  ws.getCell('A4').value = `Scope: ${report.scope.orgUnitId ? `org unit ${report.scope.orgUnitId}` : 'entire organization (within caller access)'}`;
  ws.getCell('A5').value = `Generated: ${report.generatedAt.toLocaleString()}`;
  for (let r = 2; r <= 5; r++) ws.getCell(`A${r}`).font = SUBTLE_FONT;

  let row = 7;
  ws.getCell(`A${row}`).value = 'Fleet Position This Period';
  ws.getCell(`A${row}`).font = { bold: true, size: 12 };
  row += 1;

  const positionRows: Array<[string, string]> = [
    ['Total fuel cost', labeledText(report.fleetPosition.totalFuelCost, (v) => v.toFixed(2))],
    ['Total litres fuelled', labeledText(report.fleetPosition.totalLitres, (v) => v.toFixed(2))],
    ['Fuel log count', labeledText(report.fleetPosition.logCount)],
    ['Vehicles active', labeledText(report.fleetPosition.vehiclesActive)],
    ['Average cost per litre', labeledText(report.fleetPosition.averageCostPerLitre, (v) => v.toFixed(3))],
  ];
  for (const [label, value] of positionRows) {
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`B${row}`).value = value;
    row += 1;
  }

  row += 1;
  ws.getCell(`A${row}`).value = 'Financial Reconciliation (Allocation Ledger)';
  ws.getCell(`A${row}`).font = { bold: true, size: 12 };
  row += 1;
  ws.getCell(`A${row}`).value = 'Status';
  ws.getCell(`B${row}`).value =
    report.allocationReconciliation.reconciled === null
      ? 'Not evaluated (insufficient data)'
      : report.allocationReconciliation.reconciled
        ? 'Reconciled'
        : 'NOT reconciled — see sheet 07';
  row += 1;

  row += 1;
  ws.getCell(`A${row}`).value = 'Data Quality';
  ws.getCell(`A${row}`).font = { bold: true, size: 12 };
  row += 1;
  ws.getCell(`A${row}`).value = 'Overall assessment';
  ws.getCell(`B${row}`).value = report.dataQuality.overallAssessment;
  row += 2;

  ws.getCell(`A${row}`).value = `Findings requiring attention this period: ${report.findings.filter((f) => f.severity !== 'info').length} of ${report.findings.length} total`;
  ws.getCell(`A${row}`).font = { bold: true };
  row += 1;
  ws.getCell(`A${row}`).value = 'See sheet 09 (Findings & Recommended Actions) for the full list, and REPORTING-GUIDE.md for how to use this workbook.';
  ws.getCell(`A${row}`).font = SUBTLE_FONT;
}

function styleHeaderRow(ws: ExcelJS.Worksheet, rowNumber: number, lastCol: string): void {
  const row = ws.getRow(rowNumber);
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
  ws.views = [{ state: 'frozen', ySplit: rowNumber }];
  ws.autoFilter = `A${rowNumber}:${lastCol}${rowNumber}`;
}

function addWhatChangedSheet(workbook: ExcelJS.Workbook, report: MonthlyFuelIntelligenceReport): void {
  const ws = workbook.addWorksheet('02 Fleet Position & MoM');
  ws.columns = [
    { header: 'Metric', key: 'label', width: 32 },
    { header: 'Unit', key: 'unit', width: 16 },
    { header: `This period (${report.period.label})`, key: 'current', width: 22 },
    { header: `Prior period${report.whatChanged.comparisonPeriodLabel ? ` (${report.whatChanged.comparisonPeriodLabel})` : ''}`, key: 'previous', width: 22 },
    { header: 'Change', key: 'delta', width: 16 },
    { header: 'Change %', key: 'deltaPercent', width: 14 },
    { header: 'Direction', key: 'direction', width: 12 },
    { header: 'Possible explanation (corroborated only)', key: 'explanation', width: 60 },
  ];
  styleHeaderRow(ws, 1, 'H');

  for (const m of report.whatChanged.metrics) {
    ws.addRow({
      label: m.label,
      unit: m.unit,
      current: labeledNumber(m.current),
      previous: labeledNumber(m.previous),
      delta: labeledNumber(m.delta),
      deltaPercent: m.deltaPercent.status === 'CALCULATED' && m.deltaPercent.value !== null ? m.deltaPercent.value / 100 : labeledText(m.deltaPercent),
      direction: m.direction,
      explanation: labeledText(m.possibleExplanation),
    });
  }
  ws.getColumn('deltaPercent').numFmt = '0.0%';
}

function addCostDriversSheet(workbook: ExcelJS.Workbook, report: MonthlyFuelIntelligenceReport): void {
  const ws = workbook.addWorksheet('03 Cost Drivers by Vehicle');
  ws.columns = [
    { header: 'License plate', key: 'plate', width: 16 },
    { header: 'Total cost this period', key: 'cost', width: 20 },
    { header: 'Total litres', key: 'litres', width: 16 },
    { header: 'Fuel log count', key: 'count', width: 14 },
    { header: 'Share of fleet fuel cost', key: 'share', width: 20 },
    { header: 'Classification', key: 'classification', width: 16 },
    { header: 'Why (if abnormal)', key: 'reason', width: 60 },
  ];
  styleHeaderRow(ws, 1, 'G');

  for (const r of report.costDrivers.rows) {
    const row = ws.addRow({
      plate: r.license_plate,
      cost: labeledNumber(r.totalCost),
      litres: labeledNumber(r.totalLitres),
      count: labeledNumber(r.logCount),
      share: r.shareOfFleetCostPercent.status === 'CALCULATED' && r.shareOfFleetCostPercent.value !== null ? r.shareOfFleetCostPercent.value / 100 : labeledText(r.shareOfFleetCostPercent),
      classification: r.classification === 'high_cost' ? 'HIGH COST' : r.classification === 'abnormal_cost' ? 'ABNORMAL COST' : 'Normal',
      reason: r.abnormalReason ?? '',
    });
    if (r.classification === 'abnormal_cost') row.eachCell((c) => (c.fill = ISSUE_FILL.urgent));
    else if (r.classification === 'high_cost') row.eachCell((c) => (c.fill = ISSUE_FILL.info));
  }
  ws.getColumn('cost').numFmt = '#,##0.00';
  ws.getColumn('litres').numFmt = '#,##0.00';
  ws.getColumn('share').numFmt = '0.0%';

  const concEnd = ws.lastRow!.number + 2;
  ws.getCell(`A${concEnd}`).value = 'Top-vehicle cost concentration:';
  ws.getCell(`A${concEnd}`).font = { bold: true };
  ws.getCell(`B${concEnd}`).value =
    report.costDrivers.topVehicleConcentration.status === 'CALCULATED'
      ? `Top ${report.costDrivers.topVehicleConcentration.value!.vehicleCount} vehicle(s) account for ${report.costDrivers.topVehicleConcentration.value!.costSharePercent}% of fleet fuel cost.`
      : labeledText(report.costDrivers.topVehicleConcentration);
}

function addDriverSheet(workbook: ExcelJS.Workbook, report: MonthlyFuelIntelligenceReport): void {
  const ws = workbook.addWorksheet('04 Driver Fuel Intelligence');
  ws.columns = [
    { header: 'Driver', key: 'name', width: 26 },
    { header: 'Total fuel cost', key: 'cost', width: 18 },
    { header: 'Total litres', key: 'litres', width: 16 },
    { header: 'Fuel log count', key: 'count', width: 14 },
    { header: 'Vehicles fuelled', key: 'vehicles', width: 16 },
  ];
  styleHeaderRow(ws, 1, 'E');

  const rows: DriverFindingRow[] = report.driverFindings.rows;
  for (const r of rows) {
    ws.addRow({
      name: r.driverName,
      cost: labeledNumber(r.totalCost),
      litres: labeledNumber(r.totalLitres),
      count: labeledNumber(r.logCount),
      vehicles: labeledNumber(r.vehicleCount),
    });
  }
  ws.getColumn('cost').numFmt = '#,##0.00';
  ws.getColumn('litres').numFmt = '#,##0.00';

  const noteRow = ws.lastRow!.number + 2;
  ws.getCell(`A${noteRow}`).value = 'Unassigned fuel cost (no Hub driver):';
  ws.getCell(`A${noteRow}`).font = { bold: true };
  ws.getCell(`B${noteRow}`).value = labeledText(report.driverFindings.unassignedCost, (v) => v.toFixed(2));
  ws.getCell(`A${noteRow + 1}`).value = 'Unassigned share of fleet cost:';
  ws.getCell(`B${noteRow + 1}`).value = labeledText(report.driverFindings.unassignedSharePercent, (v) => `${v}%`);
  ws.getCell(`A${noteRow + 2}`).value = 'Vehicles with no Hub driver:';
  ws.getCell(`B${noteRow + 2}`).value = report.driverFindings.unassignedVehiclePlates.length > 0
    ? report.driverFindings.unassignedVehiclePlates.join(', ')
    : 'None';
  ws.getCell(`A${noteRow + 4}`).value = report.driverFindings.attributionNote;
  ws.getCell(`A${noteRow + 4}`).font = SUBTLE_FONT;
  ws.getCell(`A${noteRow + 4}`).alignment = { wrapText: true };
  ws.mergeCells(`A${noteRow + 4}:E${noteRow + 6}`);
}

function addFuelTypeSheet(workbook: ExcelJS.Workbook, report: MonthlyFuelIntelligenceReport): void {
  const ws = workbook.addWorksheet('05 Fuel Type Mix');
  ws.columns = [
    { header: 'Fuel type', key: 'type', width: 20 },
    { header: 'Litres', key: 'litres', width: 16 },
    { header: 'Cost', key: 'cost', width: 16 },
    { header: 'Share of litres', key: 'percent', width: 16 },
  ];
  styleHeaderRow(ws, 1, 'D');
  for (const r of report.fuelTypeMix) {
    ws.addRow({
      type: r.fuelType,
      litres: labeledNumber(r.litres),
      cost: labeledNumber(r.cost),
      percent: r.percentage.status === 'CALCULATED' && r.percentage.value !== null ? r.percentage.value / 100 : labeledText(r.percentage),
    });
  }
  ws.getColumn('litres').numFmt = '#,##0.00';
  ws.getColumn('cost').numFmt = '#,##0.00';
  ws.getColumn('percent').numFmt = '0.0%';
}

function addAbnormalSheet(workbook: ExcelJS.Workbook, report: MonthlyFuelIntelligenceReport): void {
  const ws = workbook.addWorksheet('06 Abnormal & Exceptions');
  ws.getCell('A1').value = 'Basis for volume-anomaly flagging:';
  ws.getCell('A1').font = { bold: true };
  ws.mergeCells('A2:F3');
  ws.getCell('A2').value = report.abnormalFindings.volumeAnomalyBasis;
  ws.getCell('A2').alignment = { wrapText: true };
  ws.getCell('A2').font = SUBTLE_FONT;

  let row = 5;
  ws.getCell(`A${row}`).value = 'Individual fill-up volume anomalies';
  ws.getCell(`A${row}`).font = { bold: true, size: 12 };
  row += 1;
  const headerRow1 = row;
  ws.getRow(row).values = ['License plate', 'Date', 'Volume', 'Anomaly score (x average)', 'Threshold'];
  styleHeaderRow(ws, headerRow1, 'E');
  row += 1;
  for (const a of report.abnormalFindings.volumeAnomalies) {
    ws.getRow(row).values = [a.license_plate, a.date, a.volume, a.anomalyScore, a.threshold];
    row += 1;
  }
  if (report.abnormalFindings.volumeAnomalies.length === 0) {
    ws.getCell(`A${row}`).value = 'None flagged this period.';
    ws.getCell(`A${row}`).font = SUBTLE_FONT;
    row += 1;
  }

  row += 2;
  ws.getCell(`A${row}`).value = 'Vehicle-level month-over-month cost spikes';
  ws.getCell(`A${row}`).font = { bold: true, size: 12 };
  row += 1;
  const headerRow2 = row;
  ws.getRow(row).values = ['License plate', 'Total cost this period', 'Why flagged'];
  styleHeaderRow(ws, headerRow2, 'C');
  row += 1;
  for (const r of report.abnormalFindings.vehicleCostSpikes) {
    ws.getRow(row).values = [r.license_plate, labeledNumber(r.totalCost), r.abnormalReason ?? ''];
    row += 1;
  }
  if (report.abnormalFindings.vehicleCostSpikes.length === 0) {
    ws.getCell(`A${row}`).value = 'None flagged this period.';
    ws.getCell(`A${row}`).font = SUBTLE_FONT;
  }
  ws.columns = [{ width: 18 }, { width: 24 }, { width: 60 }];
}

function addReconciliationSheet(workbook: ExcelJS.Workbook, report: MonthlyFuelIntelligenceReport): void {
  const ws = workbook.addWorksheet('07 Financial Reconciliation');
  ws.columns = [{ width: 34 }, { width: 60 }];
  const r = report.allocationReconciliation;
  const rows: Array<[string, string]> = [
    ['Operational fuel total (from fuel logs)', labeledText(r.operationalTotal, (v) => v.toFixed(2))],
    ['Allocation ledger fuel total', labeledText(r.ledgerTotal, (v) => v.toFixed(2))],
    ['Variance', labeledText(r.variance, (v) => v.toFixed(2))],
    ['Variance %', labeledText(r.variancePercent, (v) => `${v}%`)],
    ['Reconciled?', r.reconciled === null ? 'Not evaluated' : r.reconciled ? 'Yes' : 'No'],
  ];
  let row = 1;
  for (const [label, value] of rows) {
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { bold: true };
    ws.getCell(`B${row}`).value = value;
    row += 1;
  }
  row += 1;
  ws.mergeCells(`A${row}:B${row + 3}`);
  ws.getCell(`A${row}`).value = r.note;
  ws.getCell(`A${row}`).alignment = { wrapText: true };
  ws.getCell(`A${row}`).font = SUBTLE_FONT;

  ws.getCell('A1').fill = HEADER_FILL;
  ws.getCell('A1').font = { ...HEADER_FONT };
}

function addDataQualitySheet(workbook: ExcelJS.Workbook, report: MonthlyFuelIntelligenceReport): void {
  const ws = workbook.addWorksheet('08 Data Quality');
  ws.getCell('A1').value = `Overall assessment: ${report.dataQuality.overallAssessment.toUpperCase()}`;
  ws.getCell('A1').font = { bold: true, size: 12 };
  ws.getCell('A2').value = `${report.dataQuality.totalLogsInPeriod} fuel log(s) assessed for this period.${report.dataQuality.truncated ? ' NOTE: the underlying export was truncated at the row cap -- these figures are based on a partial dataset.' : ''}`;
  ws.getCell('A2').font = SUBTLE_FONT;

  let row = 4;
  const headerRow = row;
  ws.getRow(row).values = ['Metric', 'Affected', 'Total', 'Percent', 'Severity', 'Detail'];
  ws.columns = [{ width: 46 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 60 }];
  styleHeaderRow(ws, headerRow, 'F');
  row += 1;
  for (const m of report.dataQuality.metrics) {
    const r = ws.addRow({});
    ws.getRow(row).values = [m.label, m.affectedCount, m.totalCount, m.percent / 100, m.severity, m.detail];
    ws.getRow(row).getCell(4).numFmt = '0.0%';
    if (ISSUE_FILL[m.severity]) r.eachCell((c) => (c.fill = ISSUE_FILL[m.severity]));
    row += 1;
  }
}

function addFindingsSheet(workbook: ExcelJS.Workbook, report: MonthlyFuelIntelligenceReport): void {
  const ws = workbook.addWorksheet('09 Findings & Actions');
  ws.columns = [
    { header: 'What', key: 'what', width: 45 },
    { header: 'Why it matters', key: 'why', width: 45 },
    { header: 'Impact', key: 'impact', width: 30 },
    { header: 'Recommended action', key: 'action', width: 45 },
    { header: 'How', key: 'how', width: 45 },
    { header: 'Prevention', key: 'prevention', width: 40 },
    { header: 'Owner/area', key: 'owner', width: 18 },
    { header: 'Monitor next month', key: 'monitor', width: 40 },
    { header: 'Severity', key: 'severity', width: 12 },
  ];
  styleHeaderRow(ws, 1, 'I');

  const bySeverity: Record<Finding['severity'], number> = { urgent: 0, attention: 1, info: 2 };
  const sorted = [...report.findings].sort((a, b) => bySeverity[a.severity] - bySeverity[b.severity]);

  for (const f of sorted) {
    const row = ws.addRow({
      what: f.what,
      why: f.why,
      impact: labeledText(f.impact),
      action: f.action ?? '',
      how: f.how ?? '',
      prevention: f.prevention ?? '',
      owner: f.owner ?? '',
      monitor: f.monitor ?? '',
      severity: f.severity.toUpperCase(),
    });
    row.eachCell((c) => (c.alignment = { wrapText: true, vertical: 'top' }));
    if (ISSUE_FILL[f.severity]) row.getCell(9).fill = ISSUE_FILL[f.severity];
  }
  if (sorted.length === 0) {
    ws.addRow({ what: 'No findings requiring attention were generated for this period.' });
  }
}

export async function buildFuelIntelligenceExcelBuffer(report: MonthlyFuelIntelligenceReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fleet Operating Intelligence Platform';
  workbook.created = report.generatedAt;
  workbook.properties.date1904 = false;

  addHeaderSheet(workbook, report);
  addWhatChangedSheet(workbook, report);
  addCostDriversSheet(workbook, report);
  addDriverSheet(workbook, report);
  addFuelTypeSheet(workbook, report);
  addAbnormalSheet(workbook, report);
  addReconciliationSheet(workbook, report);
  addDataQualitySheet(workbook, report);
  addFindingsSheet(workbook, report);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
