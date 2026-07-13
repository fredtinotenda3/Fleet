// frontend/modules/reports/schemas/exportConfig.ts
//
// Maps onto GenerateExecutionInput consumed by reportExecutionsApi.generate
// (report-execution.controller.ts#generate -> generateExecutionSchema on the
// backend). Export always runs against a saved report definition so filters,
// sorting, grouping, and tenant/permission scoping are enforced exactly the
// same way as the live preview - the export can never diverge from what the
// user saw on screen.

import { z } from 'zod';

// Mirrors the generators actually implemented on the backend:
// csv-report.generator.ts, excel-report.generator.ts, pdf-report.generator.ts,
// word-report.generator.ts. JSON is served directly by the API without a
// generator, useful for programmatic consumption.
export const EXPORT_FORMATS = ['csv', 'excel', 'pdf', 'word', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const exportConfigSchema = z.object({
  reportDefinitionId: z.string().min(1, 'Choose a report to export.'),
  format: z.enum(EXPORT_FORMATS).default('excel'),
  includeCharts: z.boolean().default(false),
  fileName: z.string().max(150).optional(),
});

export type ExportConfig = z.infer<typeof exportConfigSchema>;

export const defaultExportConfig: Partial<ExportConfig> = {
  format: 'excel',
  includeCharts: false,
};

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: 'CSV',
  excel: 'Excel (.xlsx)',
  pdf: 'PDF',
  word: 'Word (.docx)',
  json: 'JSON',
};

export const EXPORT_FORMAT_MIME: Record<ExportFormat, string> = {
  csv: 'text/csv',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  json: 'application/json',
};