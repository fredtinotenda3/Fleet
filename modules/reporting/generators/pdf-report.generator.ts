// modules/reporting/generators/pdf-report.generator.ts
// ASSUMPTION: uses `pdfkit`. This is NOT confirmed to be in package.json --
// if it isn't, `npm install pdfkit @types/pdfkit` before this compiles/runs.

import PDFDocument from 'pdfkit';
import { ReportResult } from '../types/report-definition.types';

export async function buildPdfBuffer(title: string, result: ReportResult): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(title, { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666').text(`Generated ${new Date().toLocaleString()}`);
    doc.moveDown();

    const columnWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / result.columns.length;
    const startX = doc.page.margins.left;
    let y = doc.y;

    doc.fontSize(9).fillColor('#000');
    result.columns.forEach((col, i) => {
      doc.text(col.label, startX + i * columnWidth, y, { width: columnWidth, ellipsis: true });
    });
    y += 16;
    doc.moveTo(startX, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke();
    y += 4;

    for (const row of result.rows) {
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      result.columns.forEach((col, i) => {
        const value = row[col.key];
        const text = value instanceof Date ? value.toLocaleDateString() : String(value ?? '');
        doc.text(text, startX + i * columnWidth, y, { width: columnWidth, ellipsis: true });
      });
      y += 14;
    }

    doc.end();
  });
}