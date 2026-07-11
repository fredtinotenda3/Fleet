// frontend/shared/import/ImportModal.tsx
//
// Generic, entity-agnostic CSV import UI. Each entity (Vehicles, Fuel
// Logs, and -- via the same component -- Trips/Maintenance/Expenses in
// future) supplies a column template and an `onImport` callback; this
// component owns file selection, client-side parsing/preview, lightweight
// required-field checks, submission, and the success/failure report.
//
// Row-level business validation (duplicate license plates, invalid
// dates/numbers, missing vehicle references, etc.) is intentionally NOT
// duplicated here -- it already lives in the Zod schemas backing each
// entity's create command handler (vehicleCreateSchema,
// fuelLogCreateSchema, ...). This modal submits every parsed row and
// renders whatever per-row result the server reports, so there is a
// single source of truth for "what is a valid record."

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { UploadCloud, FileText, X, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { readCsvFile, buildCsvText, downloadCsvText } from '@/shared/utils/csv-parser.utils';

export type ImportColumnType = 'string' | 'number' | 'boolean' | 'date';

export interface ImportColumnDef {
  /** Must match the CSV header exactly (case-insensitive match is applied). */
  key: string;
  label: string;
  required?: boolean;
  type?: ImportColumnType;
  example?: string;
  description?: string;
}

export interface ImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  error?: string;
}

export interface ImportSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface ImportResponse {
  summary: ImportSummary;
  results: ImportRowResult[];
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  columns: ImportColumnDef[];
  onImport: (records: Array<Record<string, unknown>>) => Promise<ImportResponse>;
  onImportComplete?: (response: ImportResponse) => void;
  maxPreviewRows?: number;
  maxRows?: number;
}

type Stage = 'select' | 'preview' | 'submitting' | 'report';

function coerceValue(raw: string, type: ImportColumnType | undefined): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  switch (type) {
    case 'number': {
      const num = Number(trimmed);
      return Number.isNaN(num) ? trimmed : num;
    }
    case 'boolean':
      return ['true', '1', 'yes', 'y'].includes(trimmed.toLowerCase());
    case 'date':
    case 'string':
    default:
      return trimmed;
  }
}

export function ImportModal({
  open,
  onOpenChange,
  title,
  description,
  columns,
  onImport,
  onImportComplete,
  maxPreviewRows = 25,
  maxRows = 2000,
}: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('select');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const requiredColumns = useMemo(() => columns.filter((c) => c.required).map((c) => c.key), [columns]);

  const missingRequiredColumns = useMemo(() => {
    const lowerHeaders = new Set(headers.map((h) => h.toLowerCase()));
    return requiredColumns.filter((key) => !lowerHeaders.has(key.toLowerCase()));
  }, [headers, requiredColumns]);

  const rowsMissingRequiredValues = useMemo(() => {
    if (missingRequiredColumns.length > 0) return 0;
    return rows.filter((row) =>
      requiredColumns.some((key) => {
        const headerMatch = headers.find((h) => h.toLowerCase() === key.toLowerCase());
        const value = headerMatch ? row[headerMatch] : '';
        return !value || value.trim() === '';
      })
    ).length;
  }, [rows, requiredColumns, headers, missingRequiredColumns]);

  function reset() {
    setStage('select');
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setParseError(null);
    setResponse(null);
  }

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null);
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setParseError('Please select a .csv file.');
        return;
      }
      try {
        const parsed = await readCsvFile(file);
        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
          setParseError('The file appears to be empty or could not be parsed as CSV.');
          return;
        }
        if (parsed.rows.length > maxRows) {
          setParseError(`This file has ${parsed.rows.length} rows, which exceeds the ${maxRows}-row limit per import. Split it into smaller batches.`);
          return;
        }
        setFileName(file.name);
        setHeaders(parsed.headers);
        setRows(parsed.rows);
        setStage('preview');
      } catch {
        setParseError('Failed to read or parse this file. Please check it is a valid CSV.');
      }
    },
    [maxRows]
  );

  function handleDownloadTemplate() {
    const sampleRow: Record<string, unknown> = {};
    columns.forEach((col) => {
      sampleRow[col.key] = col.example ?? '';
    });
    const csv = buildCsvText(
      columns.map((c) => c.key),
      [sampleRow]
    );
    downloadCsvText(csv, `${title.toLowerCase().replace(/\s+/g, '-')}-template.csv`);
  }

  function buildRecordsForSubmission(): Array<Record<string, unknown>> {
    return rows.map((row) => {
      const record: Record<string, unknown> = {};
      columns.forEach((col) => {
        const headerMatch = headers.find((h) => h.toLowerCase() === col.key.toLowerCase());
        const rawValue = headerMatch ? row[headerMatch] : '';
        const value = coerceValue(rawValue ?? '', col.type);
        if (value !== undefined) record[col.key] = value;
      });
      return record;
    });
  }

  async function handleConfirmImport() {
    setStage('submitting');
    try {
      const records = buildRecordsForSubmission();
      const result = await onImport(records);
      setResponse(result);
      setStage('report');
      onImportComplete?.(result);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Import failed unexpectedly.');
      setStage('preview');
    }
  }

  function handleDownloadErrorReport() {
    if (!response) return;
    const failedRows = response.results.filter((r) => !r.success);
    const csv = buildCsvText(
      ['row', 'identifier', 'error'],
      failedRows.map((r) => ({ row: r.row, identifier: r.identifier ?? '', error: r.error ?? '' }))
    );
    downloadCsvText(csv, `${title.toLowerCase().replace(/\s+/g, '-')}-import-errors.csv`);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {stage === 'select' && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <UploadCloud className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium text-body-sm text-foreground">Drag and drop a CSV file, or click to browse</p>
              <p className="text-caption text-muted-foreground">Up to {maxRows.toLocaleString()} rows per import</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = '';
                }}
              />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 p-3 border rounded-md border-destructive/30 bg-destructive/5 text-body-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{parseError}</span>
              </div>
            )}

            <div className="flex items-center justify-between p-3 border rounded-md border-border">
              <div>
                <p className="font-medium text-body-sm text-foreground">Need the column format?</p>
                <p className="text-caption text-muted-foreground">
                  Download a template with the expected headers and an example row.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="h-3.5 w-3.5" />
                Template
              </Button>
            </div>

            <div>
              <p className="mb-2 font-semibold tracking-wide uppercase text-caption text-muted-foreground">Columns</p>
              <div className="flex flex-wrap gap-1.5">
                {columns.map((col) => (
                  <Badge key={col.key} variant={col.required ? 'default' : 'outline'}>
                    {col.label}
                    {col.required ? ' *' : ''}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {stage === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-md border-border">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="font-medium text-body-sm text-foreground">{fileName}</p>
                  <p className="text-caption text-muted-foreground">{rows.length} row(s) detected</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-3.5 w-3.5" />
                Choose different file
              </Button>
            </div>

            {missingRequiredColumns.length > 0 && (
              <div className="flex items-start gap-2 p-3 border rounded-md border-destructive/30 bg-destructive/5 text-body-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Missing required column(s): {missingRequiredColumns.join(', ')}. Download the template to see the
                  expected headers.
                </span>
              </div>
            )}

            {missingRequiredColumns.length === 0 && rowsMissingRequiredValues > 0 && (
              <div className="flex items-start gap-2 p-3 border rounded-md border-warning/40 bg-warning-bg text-body-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {rowsMissingRequiredValues} row(s) are missing a required value and will likely be rejected during
                  import. You can still proceed -- valid rows will be imported and rejected rows will be reported.
                </span>
              </div>
            )}

            {parseError && (
              <div className="flex items-start gap-2 p-3 border rounded-md border-destructive/30 bg-destructive/5 text-body-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{parseError}</span>
              </div>
            )}

            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col.key}>
                        {col.label}
                        {col.required ? ' *' : ''}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, maxPreviewRows).map((row, i) => (
                    <TableRow key={i}>
                      {columns.map((col) => {
                        const headerMatch = headers.find((h) => h.toLowerCase() === col.key.toLowerCase());
                        return <TableCell key={col.key}>{headerMatch ? row[headerMatch] : ''}</TableCell>;
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > maxPreviewRows && (
              <p className="text-caption text-muted-foreground">
                Showing first {maxPreviewRows} of {rows.length} rows. All {rows.length} will be submitted.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmImport} disabled={missingRequiredColumns.length > 0}>
                Import {rows.length} row{rows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}

        {stage === 'submitting' && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="w-8 h-8 border-2 rounded-full animate-spin border-primary border-t-transparent" />
            <p className="text-body-sm text-muted-foreground">Importing {rows.length} row(s)…</p>
          </div>
        )}

        {stage === 'report' && response && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 text-center border rounded-md border-border">
                <p className="text-h2 text-foreground">{response.summary.total}</p>
                <p className="text-caption text-muted-foreground">Total rows</p>
              </div>
              <div className="p-3 text-center border rounded-md border-success/40 bg-success-bg">
                <p className="text-h2 text-success">{response.summary.succeeded}</p>
                <p className="text-caption text-muted-foreground">Imported</p>
              </div>
              <div className="p-3 text-center border rounded-md border-destructive/30 bg-destructive/5">
                <p className="text-h2 text-destructive">{response.summary.failed}</p>
                <p className="text-caption text-muted-foreground">Failed</p>
              </div>
            </div>

            {response.summary.failed > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-body-sm text-foreground">Failed rows</p>
                  <Button variant="outline" size="sm" onClick={handleDownloadErrorReport}>
                    <Download className="h-3.5 w-3.5" />
                    Download error report
                  </Button>
                </div>
                <div className="overflow-y-auto border rounded-md max-h-64 border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {response.results
                        .filter((r) => !r.success)
                        .map((r) => (
                          <TableRow key={r.row}>
                            <TableCell>{r.row}</TableCell>
                            <TableCell>{r.identifier ?? '—'}</TableCell>
                            <TableCell className="text-destructive">{r.error}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {response.summary.failed === 0 && (
              <div className="flex items-center gap-2 p-3 border rounded-md border-success/40 bg-success-bg text-body-sm text-success">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                All rows imported successfully.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={reset}>
                Import another file
              </Button>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}