
// modules/reporting/generators/excel-report.generator.ts

import * as XLSX from 'xlsx';
import { ReportResult } from '../types/report-definition.types';
import { PivotResult } from '../types/pivot.types';

function normalizeCell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return '';
  return value;
}

export function buildExcelBuffer(result: ReportResult, pivot?: PivotResult): Buffer {
  const workbook = XLSX.utils.book_new();

  const header = result.columns.map((c) => c.label);
  const rows = result.rows.map((row) => result.columns.map((c) => normalizeCell(row[c.key])));
  const sheetData: unknown[][] = [header, ...rows];

  if (result.totals) {
    sheetData.push([]);
    sheetData.push(['Totals']);
    for (const [key, value] of Object.entries(result.totals)) {
      sheetData.push([key, value]);
    }
  }

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheetData), 'Report');

  if (pivot) {
    const pivotHeader = ['', ...pivot.columnKeys, 'Total'];
    const pivotRows = pivot.rowKeys.map((rowKey) => [
      rowKey,
      ...pivot.columnKeys.map((colKey) => pivot.matrix[rowKey]?.[colKey] ?? 0),
      pivot.rowTotals[rowKey] ?? 0,
    ]);
    const pivotTotalsRow = ['Total', ...pivot.columnKeys.map((c) => pivot.columnTotals[c] ?? 0), pivot.grandTotal];

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([pivotHeader, ...pivotRows, pivotTotalsRow]),
      'Pivot'
    );
  }

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer);
}