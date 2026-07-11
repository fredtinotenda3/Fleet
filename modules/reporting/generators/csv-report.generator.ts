// modules/reporting/generators/csv-report.generator.ts
// No external library needed -- plain string building.

import { ReportResult } from '../types/report-definition.types';

function escapeCsvValue(value: unknown): string {
  if (value == null) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvBuffer(result: ReportResult): Buffer {
  const header = result.columns.map((c) => escapeCsvValue(c.label)).join(',');
  const lines = result.rows.map((row) =>
    result.columns.map((c) => escapeCsvValue(row[c.key])).join(',')
  );
  return Buffer.from([header, ...lines].join('\n'), 'utf-8');
}