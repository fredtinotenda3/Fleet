
// modules/reporting/generators/csv-report.generator.ts

import { ReportResult } from '../types/report-definition.types';

function escapeCsvCell(value: unknown): string {
  if (value == null) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Server-safe CSV builder — deliberately independent of
 * shared/utils/csv.utils.ts, which relies on Blob/document and is
 * browser-only.
 */
export function buildCsvBuffer(result: ReportResult): Buffer {
  const header = result.columns.map((c) => escapeCsvCell(c.label)).join(',');
  const rows = result.rows.map((row) => result.columns.map((c) => escapeCsvCell(row[c.key])).join(','));

  const lines = [header, ...rows];

  if (result.totals) {
    lines.push('');
    lines.push('Totals');
    for (const [key, value] of Object.entries(result.totals)) {
      lines.push(`${escapeCsvCell(key)},${escapeCsvCell(value)}`);
    }
  }

  return Buffer.from(lines.join('\n'), 'utf-8');
}