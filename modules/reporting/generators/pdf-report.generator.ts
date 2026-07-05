
// modules/reporting/generators/pdf-report.generator.ts

import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import { ReportResult } from '../types/report-definition.types';

const PAGE_SIZE: [number, number] = [842, 595]; // A4 landscape — fits tabular data better than portrait
const MARGIN = 40;
const ROW_HEIGHT = 18;

function formatCell(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function drawHeader(page: PDFPage, boldFont: PDFFont, font: PDFFont, title: string, rowCount: number): number {
  const { height } = page.getSize();
  page.drawText(title, { x: MARGIN, y: height - MARGIN, size: 16, font: boldFont, color: rgb(0, 0, 0) });
  page.drawText(`Generated ${new Date().toLocaleString()} - ${rowCount} row(s)`, {
    x: MARGIN,
    y: height - MARGIN - 16,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
  return height - MARGIN - 40;
}

function drawTableHeader(page: PDFPage, boldFont: PDFFont, columns: ReportResult['columns'], colWidth: number, y: number): number {
  columns.forEach((col, i) => {
    page.drawText(truncate(col.label, 30), { x: MARGIN + i * colWidth, y, size: 9, font: boldFont, color: rgb(0, 0, 0) });
  });
  page.drawLine({
    start: { x: MARGIN, y: y - 4 },
    end: { x: MARGIN + colWidth * columns.length, y: y - 4 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  return y - ROW_HEIGHT;
}

export async function buildPdfBuffer(title: string, result: ReportResult): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const columns = result.columns;
  const usableWidth = PAGE_SIZE[0] - MARGIN * 2;
  const colWidth = usableWidth / Math.max(columns.length, 1);

  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = drawHeader(page, boldFont, font, title, result.rows.length);
  y = drawTableHeader(page, boldFont, columns, colWidth, y);

  for (const row of result.rows) {
    if (y < MARGIN + ROW_HEIGHT) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
      y = drawTableHeader(page, boldFont, columns, colWidth, y);
    }

    columns.forEach((col, i) => {
      const text = formatCell(row[col.key]);
      page.drawText(truncate(text, 40), { x: MARGIN + i * colWidth, y, size: 8, font, color: rgb(0.15, 0.15, 0.15) });
    });
    y -= ROW_HEIGHT;
  }

  if (result.totals) {
    if (y < MARGIN + ROW_HEIGHT * 2) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
    y -= ROW_HEIGHT / 2;
    page.drawText('Totals', { x: MARGIN, y, size: 10, font: boldFont });
    y -= ROW_HEIGHT;
    for (const [key, value] of Object.entries(result.totals)) {
      page.drawText(`${key}: ${value.toLocaleString()}`, { x: MARGIN, y, size: 9, font });
      y -= ROW_HEIGHT * 0.8;
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}