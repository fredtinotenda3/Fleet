// frontend/shared/charts/ChartExportButton.tsx
//
// Drop-in "Export to Excel" button for a chart's CardHeader. Exports the
// exact rows already loaded into the chart (i.e. whatever the tenant-scoped
// query returned), so it never needs its own network call and can never
// leak data outside the current org-unit scope: if the chart couldn't see
// it, this button can't export it either.
//
// Wraps the existing shared/utils/excel-parser.utils.ts writer -- no new
// charting/export dependency introduced.

'use client';

import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { downloadXlsxTemplate } from '@/shared/utils/excel-parser.utils';

export interface ChartExportButtonProps {
  /** Downloaded file name, without extension (e.g. "fuel-cost-by-station"). */
  filename: string;
  /** Excel sheet name. Defaults to "Data". */
  sheetName?: string;
  /** Column headers, in the order they should appear in the sheet. */
  headers: string[];
  /**
   * Row objects keyed by header, OR a lazy factory returning them. A factory
   * is useful when building the export shape is non-trivial and shouldn't
   * run on every render.
   */
  rows: Array<Record<string, unknown>> | (() => Array<Record<string, unknown>>);
  /** Extra class names, e.g. to align inside a header flex row. */
  className?: string;
}

/** "Fuel spend by station" -> "fuel-spend-by-station" */
export function slugifyChartFilename(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ChartExportButton({ filename, sheetName = 'Data', headers, rows, className }: ChartExportButtonProps) {
  const data = typeof rows === 'function' ? rows() : rows;
  const isEmpty = !data || data.length === 0;

  function handleExport() {
    const resolved = typeof rows === 'function' ? rows() : rows;
    if (!resolved || resolved.length === 0) return;
    downloadXlsxTemplate(headers, resolved, `${filename}.xlsx`, sheetName);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={`shrink-0 text-muted-foreground hover:text-foreground ${className ?? ''}`}
      onClick={handleExport}
      disabled={isEmpty}
      title="Export to Excel"
      aria-label="Export chart data to Excel"
    >
      <FileSpreadsheet className="h-3.5 w-3.5" />
    </Button>
  );
}