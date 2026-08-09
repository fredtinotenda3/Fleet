// modules/attention/generators/ledger-pdf.generator.ts
//
// Renders a LedgerExportData snapshot as a PDF, using the same pdfkit
// dependency already used by modules/esg/generators/esg-pdf.generator.ts
// and modules/reporting/generators/pdf-report.generator.ts. Kept
// separate from both -- its input (a summary rollup plus a row-level
// posting list) is its own shape, not either of theirs.

import PDFDocument from 'pdfkit';
import type { LedgerExportData } from '../types/ledger-export.types';

const MARGIN = 48;
const MAX_ROWS_RENDERED = 200;

function formatCurrency(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatSourceLabel(source: string): string {
  return source === 'fuel_fraud' ? 'Fuel fraud' : 'Expense anomaly';
}

export async function buildLedgerPdfBuffer(data: LedgerExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ─── Header ────────────────────────────────────────────────────
    doc.fontSize(18).fillColor('#111').text('Value Ledger Export', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#555').text(data.organization.name);
    doc.fontSize(9).fillColor('#888').text(`Generated ${data.generatedAt.toLocaleString()}`);
    if (data.scope.orgUnitId) {
      doc.fontSize(9).fillColor('#888').text(`Scope: org unit ${data.scope.orgUnitId}`);
    } else {
      doc.fontSize(9).fillColor('#888').text('Scope: entire organization (within caller access)');
    }
    const filterParts: string[] = [];
    if (data.filters.source) filterParts.push(`source = ${formatSourceLabel(data.filters.source)}`);
    if (data.filters.from) filterParts.push(`from ${new Date(data.filters.from).toLocaleDateString()}`);
    if (data.filters.to) filterParts.push(`to ${new Date(data.filters.to).toLocaleDateString()}`);
    if (filterParts.length > 0) {
      doc.fontSize(9).fillColor('#888').text(`Filters: ${filterParts.join(', ')}`);
    }
    if (data.truncated) {
      doc
        .fontSize(9)
        .fillColor('#b45309')
        .text(`Truncated to the first ${data.exportCap.toLocaleString()} postings -- narrow the filters for a complete export.`);
    }
    doc.moveDown(1);

    // ─── Summary ───────────────────────────────────────────────────
    doc.fontSize(13).fillColor('#111').text('Summary');
    doc.moveDown(0.3);
    const s = data.summary;
    doc.fontSize(10).fillColor('#333');
    doc.text(`Total postings: ${s.totalPostings}`);
    doc.text(`Total modelled amount: ${formatCurrency(s.totalModelledAmount)}`);
    doc.text(`Total realised amount: ${formatCurrency(s.totalRealisedAmount)}`);
    doc.text(`Total variance (realised - modelled): ${formatCurrency(s.totalVariance)}`);
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#555').text('By source:');
    for (const source of ['fuel_fraud', 'expense_anomaly'] as const) {
      const b = s.bySource[source];
      doc
        .fontSize(9)
        .fillColor('#333')
        .text(
          `  • ${formatSourceLabel(source)}: ${b.count} posting(s), modelled ${formatCurrency(
            b.modelledAmount
          )}, realised ${formatCurrency(b.realisedAmount)}`
        );
    }
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .fillColor('#555')
      .text(
        `By baseline tier — T1: ${s.byBaselineTier.T1}, T2: ${s.byBaselineTier.T2}, T3: ${s.byBaselineTier.T3}`
      );
    doc.moveDown(1);

    // ─── Postings ──────────────────────────────────────────────────
    doc.fontSize(13).fillColor('#111').text('Postings');
    doc.moveDown(0.3);

    if (data.entries.length === 0) {
      doc.fontSize(10).fillColor('#888').text('No postings match the current filters.');
    } else {
      const rendered = data.entries.slice(0, MAX_ROWS_RENDERED);
      rendered.forEach((entry) => {
        doc
          .fontSize(9)
          .fillColor('#333')
          .text(
            `${new Date(entry.resolvedAt).toLocaleDateString()} — ${formatSourceLabel(entry.source)} — ` +
              `${entry.attentionItemKey} — tier ${entry.baselineTier} — modelled ${formatCurrency(
                entry.modelledAmount
              )} — realised ${formatCurrency(entry.realisedAmount)} — variance ${formatCurrency(entry.variance)} — ` +
              `resolved by ${entry.resolvedBy}`
          );
      });
      if (data.entries.length > rendered.length) {
        doc.moveDown(0.3);
        doc
          .fontSize(9)
          .fillColor('#888')
          .text(
            `... and ${data.entries.length - rendered.length} more posting(s) not shown in this PDF. ` +
              'Use the JSON export for the complete row set.'
          );
      }
    }

    doc.end();
  });
}
