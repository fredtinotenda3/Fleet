// frontend/modules/finance/utils/reconciliation-export.utils.ts
//
// Client-side CSV for the GL reconciliation report.
//
// Every other export in this codebase goes through triggerExport() ->
// apiClient.getBlob() -> a backend export endpoint, because those export
// paginated datasets and building a file from already-loaded rows would
// silently export only the current page (the Phase 2 "send filters, not
// rows" fix). That reasoning does not apply here: the reconciliation
// report is a single bounded response -- one line per GL account for one
// period -- and the component already holds all of it. There is no page
// two to miss.

import { exportToCSV, type ExportColumn } from '@/shared/utils/csv.utils';
import type { GLReconciliationReport, GLVarianceLine } from '../types';

/**
 * Columns mirror what the table shows, in the same order.
 *
 * `glTotal` and `variance` are emitted as an empty cell when null rather
 * than as 0. An unsubmitted GL account is not a zero-variance account,
 * and writing 0 into a spreadsheet someone then sums is how a
 * reconciliation gap disappears.
 */
export const reconciliationCsvColumns: ExportColumn<GLVarianceLine>[] = [
  { header: 'GL account', accessor: (l) => l.glAccountCode },
  { header: 'Platform total', accessor: (l) => l.platformTotal },
  { header: 'GL total', accessor: (l) => (l.glTotal == null ? '' : l.glTotal) },
  { header: 'Variance', accessor: (l) => (l.variance == null ? '' : l.variance) },
  { header: 'Variance %', accessor: (l) => (l.variancePct == null ? '' : l.variancePct) },
  { header: 'Status', accessor: (l) => (l.glTotal == null ? 'Not submitted' : l.matched ? 'Matched' : 'Variance') },
];

export function exportReconciliationCsv(report: GLReconciliationReport): void {
  const period = `${new Date(report.periodStart).toISOString().slice(0, 10)}_${new Date(report.periodEnd)
    .toISOString()
    .slice(0, 10)}`;
  exportToCSV(report.lines, reconciliationCsvColumns, `gl-reconciliation_${period}.csv`);
}