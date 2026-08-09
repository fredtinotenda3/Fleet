// frontend/modules/reports/utils/exportFormatters.ts

import type { ExportFormat } from '../schemas/exportConfig';

const FILE_EXTENSIONS: Record<ExportFormat, string> = {
  csv: 'csv',
  excel: 'xlsx',
  pdf: 'pdf',
  word: 'docx',
  json: 'json',
};

export function buildExportFileName(reportName: string, format: ExportFormat, generatedAt: Date = new Date()): string {
  const safeName = reportName
    .trim()
    .replace(/[^a-z0-9\-_ ]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase() || 'report';
  const datePart = generatedAt.toISOString().slice(0, 10);
  return `${safeName}-${datePart}.${FILE_EXTENSIONS[format]}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export type ExecutionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  pending: 'Queued',
  processing: 'Generating…',
  completed: 'Ready',
  failed: 'Failed',
};

export const EXECUTION_STATUS_COLORS: Record<ExecutionStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  processing: 'bg-info-bg text-info',
  completed: 'bg-success-bg text-success',
  failed: 'bg-danger-bg text-danger',
};