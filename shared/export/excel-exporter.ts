// shared/export/excel-exporter.ts
//
// Server-side .xlsx file generation for the Enterprise Export
// Framework. Uses the `xlsx` package that is already a project
// dependency (the same one every module's client-side
// exportXToExcel() dynamically imports) -- no new dependency
// introduced, per Phase 2 requirement 4.

import * as XLSX from 'xlsx';
import type { ExportColumn } from './export.types';

/**
 * Builds an .xlsx file buffer for the given rows/columns.
 *
 * Column headers are taken from `columns[].header`, and cell values
 * from each column's `accessor`, so a single column definition drives
 * both the CSV and Excel outputs -- there is no separate Excel-only
 * formatting path to fall out of sync (the pre-Phase-2 Fuel module
 * exporter fell back to CSV for its "Excel" export specifically
 * because it had no shared column model to drive a real xlsx writer;
 * this removes that gap).
 */
export function buildXlsxBuffer<T>(
  data: T[],
  columns: ExportColumn<T>[],
  sheetName: string = 'Export'
): Buffer {
  const headerRow = columns.map((column) => column.header);

  const rows = data.map((item) => {
    const row: Record<string, string | number> = {};
    for (const column of columns) {
      const value = column.accessor(item);
      row[column.header] = value == null ? '' : value;
    }
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headerRow });
  const workbook = XLSX.utils.book_new();
  const safeSheetName = sheetName.slice(0, 31); // Excel sheet-name length limit
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

  const arrayBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return arrayBuffer;
}