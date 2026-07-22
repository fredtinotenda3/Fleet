// shared/export/export.types.ts
//
// Enterprise Export Framework -- shared type contracts.
//
// Re-exports ExportColumn from shared/utils/csv.utils instead of
// redefining it: that type already existed (used by the Vehicles/
// Trips/Expenses client-side exporters) and duplicating it here would
// violate the "no duplicate utilities" rule. Everything else in this
// file is new, framework-level vocabulary shared by every module's
// export controller method.

export type { ExportColumn } from '@/shared/utils/csv.utils';

/** The two formats Phase 2 supports. Extending this is the extension
 *  point for a future format (e.g. 'pdf') without touching callers --
 *  they all switch on this union via ExportService. */
export type ExportFormat = 'csv' | 'xlsx';

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'csv' || value === 'xlsx';
}

/** What a repository's `getFiltered*ForExport` method returns: the
 *  capped row set actually fetched, plus enough metadata for the
 *  controller/frontend to tell the caller whether the export is
 *  complete or was truncated by the row cap. */
export interface ExportDataset<T> {
  rows: T[];
  /** Total documents matching the filter/scope query, independent of the cap. */
  totalMatched: number;
  /** true when totalMatched > rows.length, i.e. the export does NOT contain every matching record. */
  truncated: boolean;
  /** The row cap that was applied (EXPORT_ROW_CAP unless the caller overrode it). */
  exportCap: number;
}

/** A generated export file, ready to be written into an HTTP response. */
export interface ExportFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/** Metadata surfaced to the client via response headers so the UI can
 *  warn the user when an export was truncated by the row cap, without
 *  needing to parse the file itself. */
export interface ExportMeta {
  totalMatched: number;
  rowsExported: number;
  truncated: boolean;
  exportCap: number;
}