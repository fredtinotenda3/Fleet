// shared/utils/export-download.utils.ts
//
// Shared frontend half of the Phase 2 Enterprise Export Framework.
// Every module's exportXToCSV/exportXToExcel function now calls
// triggerExport() instead of building a file client-side from
// already-loaded, paginated rows. This is the single place that:
//   1. calls the module's backend export endpoint (via apiClient.getBlob)
//   2. saves the returned file to disk (via downloadBlob)
//   3. surfaces the X-Export-* truncation headers so the caller can
//      warn the user their export didn't contain every matching record
//
// Centralizing this means the "send filters, not paginated rows" fix
// only has one implementation to get right, and all five modules
// (Vehicles, Trips, Fuel, Expenses, Maintenance) automatically stay in
// sync with it.

import { downloadBlob } from './file-download.utils';

export interface ExportDownloadResult {
  truncated: boolean;
  totalMatched: number;
  rowsExported: number;
}

export interface ExportBlobResponse {
  blob: Blob;
  filename: string | null;
  headers: Headers;
}

function resolveExportMeta(headers: Headers): ExportDownloadResult {
  return {
    truncated: headers.get('X-Export-Truncated') === 'true',
    totalMatched: Number(headers.get('X-Export-Total-Matched') ?? '0'),
    rowsExported: Number(headers.get('X-Export-Rows-Exported') ?? '0'),
  };
}

export async function triggerExport(
  fetchExport: () => Promise<ExportBlobResponse>,
  fallbackFilename: string
): Promise<ExportDownloadResult> {
  const { blob, filename, headers } = await fetchExport();
  downloadBlob(blob, filename ?? fallbackFilename);
  return resolveExportMeta(headers);
}