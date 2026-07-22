// shared/export/csv-exporter.ts
//
// Server-side CSV file generation for the Enterprise Export Framework.
//
// Deliberately reuses generateCSV from shared/utils/csv.utils.ts (the
// same quoting/escaping logic already used by every module's
// client-side CSV export) instead of re-implementing CSV formatting --
// that function is pure string building with no DOM dependency, so
// it's already safe to call from a Next.js route handler.

import { generateCSV } from '@/shared/utils/csv.utils';
import type { ExportColumn } from './export.types';

/**
 * Builds a CSV file buffer for the given rows/columns.
 *
 * A UTF-8 BOM is prepended so Excel (which the Excel-format export
 * exists specifically to avoid, but users will still sometimes double
 * click a .csv file) renders non-ASCII characters correctly instead of
 * mojibake -- this only affects how spreadsheet apps *display* the
 * file, the underlying bytes are still valid UTF-8 CSV.
 */
export function buildCsvBuffer<T>(data: T[], columns: ExportColumn<T>[]): Buffer {
  const csv = generateCSV(data, columns);
  return Buffer.from(`\uFEFF${csv}`, 'utf-8');
}