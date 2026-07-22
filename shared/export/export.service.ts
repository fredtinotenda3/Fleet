// shared/export/export.service.ts
//
// Single orchestration point for turning (rows, columns, format) into
// a downloadable file. Every module's controller export method calls
// `exportService.generate(...)` -- this is the "Modules provide data
// source/query + column definitions; shared infrastructure handles
// file generation/formatting" split called for in the Phase 2 spec.

import { buildCsvBuffer } from './csv-exporter';
import { buildXlsxBuffer } from './excel-exporter';
import type { ExportColumn, ExportFile, ExportFormat } from './export.types';
import { isExportFormat } from './export.types';

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export class ExportService {
  /**
   * Resolves a raw `?format=` query value to a supported ExportFormat,
   * defaulting to 'csv' for anything missing or unrecognized rather
   * than erroring -- an export link should never 400 just because a
   * format param was omitted.
   */
  parseFormat(value: string | null | undefined): ExportFormat {
    return isExportFormat(value) ? value : 'csv';
  }

  /**
   * Generates the export file. `baseFilename` should be a short,
   * URL/filesystem-safe slug (e.g. "vehicles", "fuel-logs") -- the
   * date and extension are appended here so every module's filenames
   * follow the same convention automatically.
   */
  generate<T>(
    data: T[],
    columns: ExportColumn<T>[],
    format: ExportFormat,
    baseFilename: string,
    sheetName?: string
  ): ExportFile {
    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `${baseFilename}-${datePart}.${format}`;

    const buffer =
      format === 'xlsx'
        ? buildXlsxBuffer(data, columns, sheetName ?? baseFilename)
        : buildCsvBuffer(data, columns);

    return {
      buffer,
      contentType: CONTENT_TYPES[format],
      filename,
    };
  }
}

export const exportService = new ExportService();