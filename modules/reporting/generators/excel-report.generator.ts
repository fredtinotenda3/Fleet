// modules/reporting/generators/excel-report.generator.ts
// ASSUMPTION: uses the `xlsx` (SheetJS) package -- already imported
// client-side in this codebase (frontend/modules/expenses/utils/index.ts's
// exportExpensesToExcel), so likely already a dependency. Confirm before
// relying on this server-side.

import * as XLSX from 'xlsx';
import { ReportResult } from '../types/report-definition.types';
import { PivotResult } from '../types/pivot.types';

export function buildExcelBuffer(result: ReportResult, pivotResult?: PivotResult): Buffer {
  const workbook = XLSX.utils.book_new();

  const rows = result.rows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const col of result.columns) mapped[col.label] = row[col.key];
    return mapped;
  });
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');

  if (pivotResult) {
    const pivotRows = pivotResult.rowKeys.map((rowKey) => {
      const mapped: Record<string, unknown> = { '': rowKey };
      for (const columnKey of pivotResult.columnKeys) {
        mapped[columnKey] = pivotResult.matrix[rowKey]?.[columnKey] ?? 0;
      }
      mapped['Total'] = pivotResult.rowTotals[rowKey] ?? 0;
      return mapped;
    });
    const totalsRow: Record<string, unknown> = { '': 'Total' };
    for (const columnKey of pivotResult.columnKeys) {
      totalsRow[columnKey] = pivotResult.columnTotals[columnKey] ?? 0;
    }
    totalsRow['Total'] = pivotResult.grandTotal;
    pivotRows.push(totalsRow);

    const pivotSheet = XLSX.utils.json_to_sheet(pivotRows);
    XLSX.utils.book_append_sheet(workbook, pivotSheet, 'Pivot');
  }

  const arrayBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(arrayBuffer);
}