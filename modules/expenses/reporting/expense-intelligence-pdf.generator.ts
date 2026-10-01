// modules/expenses/reporting/expense-intelligence-pdf.generator.ts
//
// Renders a MonthlyExpenseIntelligenceReport as a narrative, print-ready
// PDF using pdfkit -- mirrors
// modules/fuel/reporting/fuel-intelligence-pdf.generator.ts's renderer,
// section flow and footer-pagination discipline exactly (same
// dependency, already disclosed from the fuel report's delivery).
//
// Section order is kept aligned 1:1 with this report's own eight
// numbered Excel sheets (expense-intelligence-excel.generator.ts), the
// same "a director reading either document sees the same set of
// sections" discipline the fuel PDF's header documents:
//   Executive Summary (01) -> What Changed (02, MoM) -> What's Driving
//   Cost (03) -> Category Mix (04) -> Abnormal/Exception Findings, incl.
//   vehicle cost spikes (05) -> Financial Reconciliation (06) -> Data
//   Quality (07) -> Findings & Recommended Actions (08, the director's
//   punch-list) -> Next-Month Monitoring (PDF-only synthesis of each
//   finding's `monitor` field; no separate Excel sheet).
//
// NO DRIVER FINDINGS SECTION -- expenses have no driver dimension (see
// expense-intelligence.types.ts's header). This is the one section the
// fuel PDF has that this one deliberately omits, not an oversight.
//
// The vehicle-cost-driver list is capped at the top 10 (by cost) with an
// explicit "+N more -- see the Excel workbook" pointer when truncated,
// same pattern as the fuel PDF's cost-driver and driver-cost lists.
//
// NOT SHARED with fuel-intelligence-pdf.generator.ts -- same deliberate,
// scoped-duplication reasoning as the Excel generator's header.

import PDFDocument from 'pdfkit';
import type {
  Finding,
  Labeled,
  MonthlyExpenseIntelligenceReport,
} from './expense-intelligence.types';

const MARGIN = 48;
const PAGE_SIZE = 'A4';
const INK = '#111111';
const MUTED = '#666666';
const FAINT = '#999999';
const ACCENT = '#1F3864';
const URGENT = '#B23A2E';
const ATTENTION = '#B8860B';

function labeledText<T>(l: Labeled<T>, formatter: (v: T) => string = (v) => String(v)): string {
  if (l.status === 'UNAVAILABLE') return `Unavailable — ${l.reason ?? 'not available for this period.'}`;
  if (l.value === null) return '—';
  const prefix = l.status === 'ESTIMATED' ? 'Estimated: ' : l.status === 'DATA_QUALITY_ISSUE' ? '⚠ ' : '';
  return `${prefix}${formatter(l.value)}`;
}

function severityColor(sev: Finding['severity']): string {
  return sev === 'urgent' ? URGENT : sev === 'attention' ? ATTENTION : MUTED;
}

/**
 * Percentages in this report come out of ordinary floating-point
 * division upstream and were being interpolated straight into template
 * strings with no rounding -- same defect class the fuel PDF's fmtPercent
 * fixed, same fix here. One decimal place matches this report's other
 * percentage displays (see the frontend UI's maximumFractionDigits: 1).
 */
export function fmtPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

class ReportRenderer {
  constructor(private doc: PDFKit.PDFDocument) {}

  ensureSpace(height: number): void {
    const bottom = this.doc.page.height - this.doc.page.margins.bottom;
    if (this.doc.y + height > bottom) {
      this.doc.addPage();
    }
  }

  sectionHeader(title: string): void {
    this.ensureSpace(50);
    this.doc.moveDown(0.6);
    this.doc.fontSize(15).fillColor(ACCENT).font('Helvetica-Bold').text(title);
    this.doc
      .moveTo(this.doc.page.margins.left, this.doc.y + 2)
      .lineTo(this.doc.page.width - this.doc.page.margins.right, this.doc.y + 2)
      .strokeColor(ACCENT)
      .lineWidth(1)
      .stroke();
    this.doc.moveDown(0.6);
    this.doc.font('Helvetica');
  }

  subheading(text: string): void {
    this.ensureSpace(24);
    this.doc.fontSize(11).fillColor(INK).font('Helvetica-Bold').text(text);
    this.doc.font('Helvetica').moveDown(0.2);
  }

  para(text: string, opts: { color?: string; size?: number; italic?: boolean } = {}): void {
    this.ensureSpace(16);
    this.doc
      .fontSize(opts.size ?? 10)
      .fillColor(opts.color ?? INK)
      .font(opts.italic ? 'Helvetica-Oblique' : 'Helvetica')
      .text(text, { width: this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right });
    this.doc.moveDown(0.3);
  }

  bullet(text: string, opts: { color?: string } = {}): void {
    this.ensureSpace(16);
    this.doc
      .fontSize(10)
      .fillColor(opts.color ?? INK)
      .text(`•  ${text}`, {
        width: this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right - 10,
        indent: 10,
      });
    this.doc.moveDown(0.15);
  }

  keyValueRow(label: string, value: string, opts: { valueColor?: string } = {}): void {
    this.ensureSpace(16);
    const labelWidth = 220;
    const startX = this.doc.page.margins.left;
    const y = this.doc.y;
    this.doc.fontSize(10).fillColor(MUTED).font('Helvetica').text(label, startX, y, { width: labelWidth });
    this.doc
      .fontSize(10)
      .fillColor(opts.valueColor ?? INK)
      .font('Helvetica-Bold')
      .text(value, startX + labelWidth, y, { width: this.doc.page.width - this.doc.page.margins.right - startX - labelWidth });
    // Same pdfkit doc.x quirk documented in the fuel PDF generator's
    // keyValueRow: an explicit-x .text() call leaves doc.x sitting at
    // that indented column afterward, so every later block would
    // otherwise render too far right and clip at the page edge instead
    // of wrapping. Restoring the margin here keeps everything after the
    // first keyValueRow() call positioned correctly.
    this.doc.x = startX;
    this.doc.font('Helvetica').moveDown(0.25);
  }
}

export async function buildExpenseIntelligencePdfBuffer(report: MonthlyExpenseIntelligenceReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: PAGE_SIZE, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const r = new ReportRenderer(doc);

    // ─── Title page block ────────────────────────────────────────────
    doc.fontSize(20).fillColor(ACCENT).font('Helvetica-Bold').text('Monthly Expense Intelligence Report');
    doc.moveDown(0.2);
    doc.fontSize(13).fillColor(INK).font('Helvetica').text(report.organization.name);
    doc.fontSize(11).fillColor(MUTED).text(`Reporting period: ${report.period.label}`);
    doc.fontSize(9).fillColor(FAINT).text(
      report.scope.orgUnitId ? `Scope: org unit ${report.scope.orgUnitId}` : 'Scope: entire organization (within caller access)'
    );
    doc.fontSize(9).fillColor(FAINT).text(`Generated: ${report.generatedAt.toLocaleString()}`);
    doc.moveDown(1);

    // ─── Executive Summary ────────────────────────────────────────────
    r.sectionHeader('Executive Summary');
    const urgentCount = report.findings.filter((f) => f.severity === 'urgent').length;
    const attentionCount = report.findings.filter((f) => f.severity === 'attention').length;
    r.para(
      urgentCount + attentionCount === 0
        ? 'No findings requiring urgent or elevated attention were identified for this period.'
        : `${urgentCount} finding(s) require urgent attention and ${attentionCount} require elevated attention this period. See "Findings & Recommended Actions" below for the full, prioritized list.`
    );
    r.keyValueRow('Total expense cost this period', labeledText(report.expensePosition.totalExpenseCost, (v) => v.toFixed(2)));
    r.keyValueRow('Expense transaction count', labeledText(report.expensePosition.transactionCount));
    r.keyValueRow('Vehicles with expenses', labeledText(report.expensePosition.vehiclesWithExpenses));
    r.keyValueRow('Average cost per transaction', labeledText(report.expensePosition.averageCostPerTransaction, (v) => v.toFixed(2)));
    r.keyValueRow(
      'Ledger reconciliation',
      report.allocationReconciliation.reconciled === null
        ? 'Not evaluated (insufficient data)'
        : report.allocationReconciliation.reconciled
          ? 'Reconciled'
          : 'NOT reconciled',
      { valueColor: report.allocationReconciliation.reconciled === false ? URGENT : INK }
    );
    r.keyValueRow('Data quality assessment', report.dataQuality.overallAssessment.toUpperCase());

    // ─── What Changed ─────────────────────────────────────────────────
    r.sectionHeader('What Changed This Period');
    if (!report.whatChanged.hasComparisonPeriod) {
      r.para('No prior comparable period has recorded data yet, so month-over-month comparison is unavailable.');
    } else {
      for (const m of report.whatChanged.metrics) {
        const arrow = m.direction === 'up' ? '↑' : m.direction === 'down' ? '↓' : m.direction === 'flat' ? '→' : '';
        const deltaText = m.deltaPercent.status === 'CALCULATED' ? `${arrow} ${m.deltaPercent.value! > 0 ? '+' : ''}${fmtPercent(m.deltaPercent.value!)}` : labeledText(m.deltaPercent);
        r.subheading(`${m.label}: ${labeledText(m.current, (v) => String(v))} (${deltaText} vs. ${report.whatChanged.comparisonPeriodLabel ?? 'prior period'})`);
        r.para(`Possible explanation: ${labeledText(m.possibleExplanation)}`, { color: MUTED, size: 9, italic: true });
      }
    }

    // ─── What's Driving Cost ────────────────────────────────────────
    r.sectionHeader("What's Driving Expense Cost");
    const conc = report.costDrivers.topVehicleConcentration;
    r.para(
      conc.status === 'CALCULATED'
        ? `The top ${conc.value!.vehicleCount} vehicle(s) by expense cost account for ${fmtPercent(conc.value!.costSharePercent)} of total fleet expense spend this period.`
        : labeledText(conc)
    );
    const sortedCostDriverRows = [...report.costDrivers.rows].sort((a, b) => (b.totalCost.value ?? 0) - (a.totalCost.value ?? 0));
    const topRows = sortedCostDriverRows.slice(0, 10);
    for (const row of topRows) {
      const tag = row.classification === 'abnormal_cost' ? ' [ABNORMAL]' : row.classification === 'high_cost' ? ' [HIGH COST]' : '';
      r.bullet(
        `${row.license_plate}${tag} — ${labeledText(row.totalCost, (v) => v.toFixed(2))} (${labeledText(row.shareOfFleetCostPercent, fmtPercent)} of fleet cost)`,
        { color: row.classification === 'abnormal_cost' ? URGENT : INK }
      );
      if (row.abnormalReason) r.para(row.abnormalReason, { color: MUTED, size: 9, italic: true });
    }
    if (topRows.length === 0) r.para('No expense cost recorded for any vehicle this period.');
    if (sortedCostDriverRows.length > 10) {
      r.para(`+ ${sortedCostDriverRows.length - 10} more vehicle(s) -- see the Excel workbook's Cost Drivers by Vehicle sheet for the full list.`, { color: FAINT, size: 9 });
    }

    // ─── Category Mix ──────────────────────────────────────────────────
    r.sectionHeader('Category Mix');
    if (report.categoryMix.length === 0) {
      r.para('No expense category data recorded for this period.');
    } else {
      for (const c of report.categoryMix) {
        const momText = c.momChangePercent.status === 'CALCULATED' && c.momChangePercent.value !== null
          ? `, ${c.momChangePercent.value > 0 ? '+' : ''}${fmtPercent(c.momChangePercent.value)} vs. prior period`
          : '';
        r.bullet(
          `${c.category} — ${labeledText(c.cost, (v) => v.toFixed(2))} across ${labeledText(c.count)} transaction(s) (${labeledText(c.percentage, fmtPercent)} of total cost${momText})`
        );
      }
    }

    // ─── Abnormal / Exception Findings ─────────────────────────────────
    r.sectionHeader('Abnormal & Exception Findings');
    r.subheading('Individual transaction amount outliers');
    r.para(report.abnormalFindings.outlierBasis, { color: MUTED, size: 9, italic: true });
    if (report.abnormalFindings.amountOutliers.length === 0) {
      r.para('No individual transaction amount outliers flagged this period.');
    } else {
      for (const a of report.abnormalFindings.amountOutliers.slice(0, 15)) {
        r.bullet(`${a.license_plate} — ${a.category} — ${a.date} — ${a.amount.toFixed(2)} (z-score ${a.zScore.toFixed(2)}, category mean ${a.categoryMean.toFixed(2)})`, { color: ATTENTION });
      }
      if (report.abnormalFindings.amountOutliers.length > 15) {
        r.para(`+ ${report.abnormalFindings.amountOutliers.length - 15} more -- see the Excel workbook's Abnormal & Exceptions sheet for the full list.`, { color: FAINT, size: 9 });
      }
    }
    r.subheading('Vehicle-level month-over-month cost spikes');
    if (report.abnormalFindings.vehicleCostSpikes.length === 0) {
      r.para('None flagged this period.');
    } else {
      for (const s of report.abnormalFindings.vehicleCostSpikes.slice(0, 15)) {
        r.bullet(`${s.license_plate} — ${labeledText(s.totalCost, (v) => v.toFixed(2))}${s.abnormalReason ? ` — ${s.abnormalReason}` : ''}`, { color: ATTENTION });
      }
      if (report.abnormalFindings.vehicleCostSpikes.length > 15) {
        r.para(`+ ${report.abnormalFindings.vehicleCostSpikes.length - 15} more -- see the Excel workbook's Abnormal & Exceptions sheet for the full list.`, { color: FAINT, size: 9 });
      }
    }

    // ─── Financial Reconciliation ───────────────────────────────────
    r.sectionHeader('Financial Position: Allocation Ledger Reconciliation');
    r.keyValueRow('Operational expense total (expense transactions)', labeledText(report.allocationReconciliation.operationalTotal, (v) => v.toFixed(2)));
    r.keyValueRow('Allocation ledger expense total', labeledText(report.allocationReconciliation.ledgerTotal, (v) => v.toFixed(2)));
    r.keyValueRow('Variance', labeledText(report.allocationReconciliation.variance, (v) => v.toFixed(2)), {
      valueColor: report.allocationReconciliation.reconciled === false ? URGENT : INK,
    });
    r.keyValueRow('Variance %', labeledText(report.allocationReconciliation.variancePercent, fmtPercent), {
      valueColor: report.allocationReconciliation.reconciled === false ? URGENT : INK,
    });
    r.keyValueRow(
      'Reconciled?',
      report.allocationReconciliation.reconciled === null ? 'Not evaluated' : report.allocationReconciliation.reconciled ? 'Yes' : 'No',
      { valueColor: report.allocationReconciliation.reconciled === false ? URGENT : INK }
    );
    r.para(report.allocationReconciliation.note, { color: MUTED, size: 9, italic: true });

    // ─── Data Quality ─────────────────────────────────────────────────
    r.sectionHeader('Data Quality');
    r.para(`${report.dataQuality.totalTransactionsInPeriod} expense transaction(s) assessed. Overall assessment: ${report.dataQuality.overallAssessment.toUpperCase()}.${report.dataQuality.truncated ? ' NOTE: underlying data was truncated at the export row cap for this assessment.' : ''}`);
    for (const m of report.dataQuality.metrics) {
      if (m.affectedCount === 0) continue;
      r.bullet(`${m.label}: ${m.affectedCount} of ${m.totalCount} (${fmtPercent(m.percent)})`, { color: severityColor(m.severity === 'urgent' ? 'urgent' : m.severity === 'attention' ? 'attention' : 'info') });
    }
    if (report.dataQuality.metrics.every((m) => m.affectedCount === 0) && report.dataQuality.metrics.length > 0) {
      r.para('No data quality issues detected for the fields assessed.');
    }

    // ─── Findings & Recommended Actions ─────────────────────────────
    r.sectionHeader('Findings & Recommended Actions');
    if (report.findings.length === 0) {
      r.para('No findings were generated for this period.');
    } else {
      const bySeverity: Record<Finding['severity'], number> = { urgent: 0, attention: 1, info: 2 };
      const sorted = [...report.findings].sort((a, b) => bySeverity[a.severity] - bySeverity[b.severity]);
      for (const f of sorted) {
        r.ensureSpace(90);
        doc.fontSize(10.5).fillColor(severityColor(f.severity)).font('Helvetica-Bold').text(`[${f.severity.toUpperCase()}] ${f.what}`);
        doc.font('Helvetica').fillColor(INK);
        r.para(`Why it matters: ${f.why}`, { size: 9.5 });
        r.para(`Impact: ${labeledText(f.impact)}`, { size: 9.5 });
        if (f.action) r.para(`Recommended action: ${f.action}`, { size: 9.5 });
        if (f.how) r.para(`How: ${f.how}`, { size: 9.5, color: MUTED });
        if (f.prevention) r.para(`Prevention: ${f.prevention}`, { size: 9.5, color: MUTED });
        if (f.owner) r.para(`Owner/area: ${f.owner}`, { size: 9.5, color: MUTED });
        if (f.monitor) r.para(`Monitor next month: ${f.monitor}`, { size: 9.5, color: MUTED, italic: true });
        doc.moveDown(0.4);
      }
    }

    // ─── Next-Month Monitoring (punch-list) ─────────────────────────
    r.sectionHeader('Next-Month Monitoring');
    const monitorItems = report.findings.map((f) => f.monitor).filter((m): m is string => Boolean(m));
    if (monitorItems.length === 0) {
      r.para('No specific monitoring items were identified from this period’s findings.');
    } else {
      for (const item of monitorItems) r.bullet(item);
    }

    // ─── Footer: page numbers on every page ─────────────────────────
    // Same margins.bottom-zeroing workaround as the fuel PDF generator's
    // footer loop -- see that file's header comment for the full
    // explanation of why drawing inside the bottom margin otherwise
    // triggers pdfkit's page-break-if-needed check and silently appends
    // a blank page per footer .text() call.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - doc.page.margins.bottom + 20;
      const savedBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .fillColor(FAINT)
        .text(
          `${report.organization.name} — Monthly Expense Intelligence Report — ${report.period.label}`,
          doc.page.margins.left,
          bottom,
          { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 60, lineBreak: false }
        );
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, doc.page.width - doc.page.margins.right - 60, bottom, {
        width: 60,
        align: 'right',
        lineBreak: false,
      });
      doc.page.margins.bottom = savedBottomMargin;
    }

    doc.end();
  });
}
