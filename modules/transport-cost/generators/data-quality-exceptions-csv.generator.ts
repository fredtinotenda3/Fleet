// modules/transport-cost/generators/data-quality-exceptions-csv.generator.ts
//
// Item 6 (data-quality exceptions export). A standalone, minimal CSV
// builder -- same no-external-library style as
// modules/reporting/generators/csv-report.generator.ts -- deliberately
// NOT coupled to that module's ReportResult type: this export has its
// own fixed, small column set (DataQualityExceptionRow) and gains
// nothing from routing through DataSourceRegistry/ReportQueryEngine,
// which Phase O1's header already ruled out for this data (see
// shared/types/transport-cost.types.ts's header).

import type { DataQualityExceptionRow } from '../services/transport-cost-report.service';

function escapeCsvValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const COLUMNS: Array<{ key: keyof DataQualityExceptionRow; label: string }> = [
  { key: 'kind', label: 'Kind' },
  { key: 'importBatchId', label: 'Import Batch' },
  { key: 'sourceFileName', label: 'Source File' },
  { key: 'sourceRowNumber', label: 'Row #' },
  { key: 'rawDate', label: 'Raw Date' },
  { key: 'rawRegistration', label: 'Raw Registration' },
  { key: 'rawTransporter', label: 'Raw Transporter' },
  { key: 'amount', label: 'Amount' },
  { key: 'reason', label: 'Reason' },
  { key: 'column', label: 'Rejected Column' },
  { key: 'invalidValue', label: 'Invalid Value' },
];

/**
 * Rejected, duplicate, and period-outlier rows in one flat CSV -- the
 * `Kind` column is how a reader (or a spreadsheet filter) tells them
 * apart, rather than three separate files. Row order: rejected, then
 * duplicates, then period outliers, each in the order the service
 * already returns them (sourceRowNumber ascending within a batch).
 */
export function buildDataQualityExceptionsCsv(rows: {
  rejected: DataQualityExceptionRow[];
  duplicates: DataQualityExceptionRow[];
  periodOutliers: DataQualityExceptionRow[];
}): Buffer {
  const allRows = [...rows.rejected, ...rows.duplicates, ...rows.periodOutliers];
  const header = COLUMNS.map((c) => escapeCsvValue(c.label)).join(',');
  const lines = allRows.map((row) => COLUMNS.map((c) => escapeCsvValue(row[c.key])).join(','));
  return Buffer.from([header, ...lines].join('\n'), 'utf-8');
}
