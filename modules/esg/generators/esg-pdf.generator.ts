// modules/esg/generators/esg-pdf.generator.ts
//
// Renders an EsgExportData snapshot as a multi-section PDF, using the
// same pdfkit dependency already used by
// modules/reporting/generators/pdf-report.generator.ts. Kept separate
// from that generator because its input is a structured, multi-section
// report rather than a flat rows/columns ReportResult.

import PDFDocument from 'pdfkit';
import type { EsgExportData } from '../types/esg-export.types';

const MARGIN = 48;

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export async function buildEsgPdfBuffer(data: EsgExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ─── Header ────────────────────────────────────────────────────
    doc.fontSize(18).fillColor('#111').text('Fleet ESG & Insurance Data Export', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#555').text(data.organization.name);
    doc.fontSize(9).fillColor('#888').text(`Generated ${data.generatedAt.toLocaleString()}`);
    if (data.scope.orgUnitId) {
      doc.fontSize(9).fillColor('#888').text(`Scope: org unit ${data.scope.orgUnitId}`);
    } else {
      doc.fontSize(9).fillColor('#888').text('Scope: entire organization (within caller access)');
    }
    doc.moveDown(1);

    // ─── Composite score ───────────────────────────────────────────
    doc.fontSize(13).fillColor('#111').text('Composite Score');
    doc.fontSize(24).fillColor('#111').text(`${data.compositeScore.value} / 100`);
    doc.fontSize(8).fillColor('#888').text(data.compositeScore.methodology, { width: 500 });
    doc.moveDown(1);

    // ─── Fleet health ──────────────────────────────────────────────
    doc.fontSize(13).fillColor('#111').text('Fleet Health');
    doc.moveDown(0.3);
    const fh = data.fleetHealth;
    const fleetLines = [
      `Overall health score: ${fh.overallScore} / 100`,
      `Vehicles assessed: ${fh.vehiclesAssessed}`,
      `Average vehicle age: ${fh.averageVehicleAgeYears.toFixed(1)} years`,
      `Average mileage: ${fh.averageMileage.toLocaleString()}`,
      `Maintenance completion rate: ${formatPercent(fh.maintenanceCompletionRate)}`,
      `Overdue maintenance items: ${fh.overdueMaintenanceCount}`,
      `Pending maintenance items: ${fh.pendingMaintenanceCount}`,
      `Average fuel efficiency: ${fh.averageFuelEfficiency.toFixed(1)}`,
      `Open recommendations: ${fh.recommendationCount} (est. ${formatCurrency(fh.estimatedRecommendedSpend)})`,
    ];
    doc.fontSize(10).fillColor('#333');
    fleetLines.forEach((line) => doc.text(line));
    doc.moveDown(1);

    // ─── Driver risk ───────────────────────────────────────────────
    doc.fontSize(13).fillColor('#111').text('Driver Risk');
    doc.moveDown(0.3);
    const dr = data.driverRisk;
    doc.fontSize(10).fillColor('#333');
    doc.text(`Drivers assessed: ${dr.driversAssessed}`);
    doc.text(`Average risk score: ${dr.averageScore} / 100 (lower is safer)`);
    doc.text(
      `Risk distribution — low: ${dr.distribution.low}, medium: ${dr.distribution.medium}, ` +
        `high: ${dr.distribution.high}, critical: ${dr.distribution.critical}`
    );
    if (dr.highRiskDrivers && dr.highRiskDrivers.length > 0) {
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#555').text('High/critical risk drivers:');
      dr.highRiskDrivers.forEach((d) => {
        doc.fontSize(9).fillColor('#333').text(`  • ${d.driverName} — ${d.riskLevel} (${d.overallScore}/100)`);
      });
    }
    doc.moveDown(1);

    // ─── Compliance ────────────────────────────────────────────────
    doc.fontSize(13).fillColor('#111').text('Compliance');
    doc.moveDown(0.3);
    const c = data.compliance;
    doc.fontSize(10).fillColor('#333');
    doc.text(`Rules in scope: ${c.totalRulesInScope}`);
    doc.text(`Records assessed: ${c.totalRecordsAssessed}`);
    doc.text(`Compliance rate: ${formatPercent(c.complianceRate)}`);
    doc.text(
      `By status — pending: ${c.byStatus.pending}, due soon: ${c.byStatus.due_soon}, ` +
        `overdue: ${c.byStatus.overdue}, resolved: ${c.byStatus.resolved}, waived: ${c.byStatus.waived}`
    );

    if (c.overdueRecords.length > 0) {
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#555').text('Overdue requirements:');
      c.overdueRecords.forEach((r) => {
        const due = r.dueDate ? new Date(r.dueDate).toLocaleDateString() : 'unknown date';
        doc.fontSize(9).fillColor('#333').text(`  • [${r.entityType}] ${r.entityId} — ${r.ruleName} (due ${due})`);
      });
    }

    doc.end();
  });
}
