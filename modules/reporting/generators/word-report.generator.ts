
// modules/reporting/generators/word-report.generator.ts

import { ReportResult } from '../types/report-definition.types';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatCell(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

/**
 * Builds a Word-compatible ".doc" file using the classic HTML+MSO markup
 * technique: Word natively opens HTML content saved with a .doc
 * extension and the schemas-microsoft-com namespaces. This avoids
 * pulling in a full OOXML/docx library purely for tabular report
 * exports; if richer native .docx output is needed later, swap this
 * generator's internals without touching any call site.
 */
export function buildWordBuffer(title: string, result: ReportResult): Buffer {
  const headerCells = result.columns
    .map((c) => `<th style="border:1px solid #ccc;padding:6px;background:#f3f4f6;text-align:left;">${escapeHtml(c.label)}</th>`)
    .join('');

  const bodyRows = result.rows
    .map((row) => {
      const cells = result.columns
        .map((c) => `<td style="border:1px solid #ddd;padding:6px;">${escapeHtml(formatCell(row[c.key]))}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  let totalsHtml = '';
  if (result.totals) {
    const totalsRows = Object.entries(result.totals)
      .map(
        ([key, value]) =>
          `<tr><td style="padding:4px;font-weight:bold;">${escapeHtml(key)}</td><td style="padding:4px;">${value.toLocaleString()}</td></tr>`
      )
      .join('');
    totalsHtml = `<h3>Totals</h3><table>${totalsRows}</table>`;
  }

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;">
  <h1>${escapeHtml(title)}</h1>
  <p style="color:#666;font-size:11px;">Generated ${new Date().toLocaleString()}</p>
  <table style="border-collapse:collapse;width:100%;">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  ${totalsHtml}
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}