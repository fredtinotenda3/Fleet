// frontend/modules/fuel/components/FuelImportModal.tsx
//
// Enterprise CSV/Excel import for fuel logs. Talks to POST /api/fuellogs/import
// (FuelController.importFuelLogs -> fuelCommandService.createFuelLog per
// row). That endpoint takes plain JSON records regardless of what file
// format they came from, so adding Excel (.xlsx/.xls) support is purely
// a client-side parsing change: readTabularFile() dispatches to either
// the existing CSV parser or the new Excel parser and returns the same
// { headers, rows } shape either way, so everything downstream (column
// validation, coerceRow, the import mutation) is unchanged.
//
// Client side row cap (2000) mirrors MAX_IMPORT_ROWS in fuel.controller.ts
// so oversized files fail fast instead of round-tripping to the server.
//
// FIX (data-quality gap, not a code bug): real-world source files
// routinely have no reliable per-row volume unit -- e.g. exported/
// consolidated spreadsheets where "litres" was implicit and never
// entered as a column value. Since unit_id is required, every such row
// previously failed validation with "unit_id: Invalid input: expected
// string, received undefined". This adds a required "Default volume
// unit" selector: any row whose unit_id cell is blank is filled in with
// this selection before import. Rows that DO have a non-blank unit_id
// value are left untouched (not silently overwritten) -- if that value
// doesn't match a real unit, the existing server-side error for that
// row will still surface, which is correct: a garbage non-blank value
// (e.g. an equipment name shifted into the wrong column) is a real data
// problem the person should look at, not something to paper over.

'use client';

import { useMemo, useRef, useState } from 'react';
import { Upload, X, FileDown, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Label } from '@/frontend/shared/ui/forms/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { buildCsvText, downloadCsvText } from '@/shared/utils/csv-parser.utils';
import { readTabularFile, downloadXlsxTemplate, IMPORT_FILE_ACCEPT } from '@/shared/utils/excel-parser.utils';
import { useImportFuelLogs } from '../hooks/useFuelMutations';
import { useFuelVolumeUnits } from '../hooks/useFuel';
import type { FuelImportResponse } from '../services/fuel.api';

const MAX_IMPORT_ROWS = 2000;

const IMPORT_COLUMNS = [
  'license_plate',
  'date',
  'fuel_volume',
  'unit_id',
  'cost',
  'odometer',
  'station_name',
  'fuel_station_id',
  'fuel_type',
  'notes',
  'currency',
  'is_full_tank',
  'receipt_url',
  'payment_method',
  'fuel_card_id',
] as const;

const PREVIEW_COLUMNS = IMPORT_COLUMNS.slice(0, 5);
const REQUIRED_COLUMNS = ['license_plate', 'date', 'fuel_volume', 'unit_id', 'cost'];
const NUMERIC_FIELDS = new Set(['fuel_volume', 'cost', 'odometer']);
const BOOLEAN_FIELDS = new Set(['is_full_tank']);

// Column reference shown to the user before they upload anything, so
// they know what's required and what format each column expects
// without having to trial-and-error against server validation errors.
interface ColumnHint {
  column: string;
  required: boolean;
  description: string;
}

const COLUMN_HINTS: ColumnHint[] = [
  { column: 'license_plate', required: true, description: "Vehicle's license plate – must match an existing vehicle" },
  { column: 'date', required: true, description: 'Fill-up date, format YYYY-MM-DD (e.g. 2026-07-01)' },
  { column: 'fuel_volume', required: true, description: 'Amount of fuel purchased, numeric' },
  { column: 'unit_id', required: true, description: 'Volume unit id (e.g. litres, gallons). If blank, the "Default volume unit" selected below is used instead.' },
  { column: 'cost', required: true, description: 'Total amount paid, numeric' },
  { column: 'odometer', required: false, description: 'Odometer reading in km' },
  { column: 'station_name', required: false, description: 'Station name, if not a registered fuel station' },
  { column: 'fuel_station_id', required: false, description: 'ID of a registered fuel station' },
  { column: 'fuel_type', required: false, description: 'diesel, petrol, electric, or hybrid' },
  { column: 'notes', required: false, description: 'Free text notes (max 500 characters)' },
  { column: 'currency', required: false, description: '3-letter currency code, e.g. USD (defaults to USD)' },
  { column: 'is_full_tank', required: false, description: 'true or false' },
  { column: 'receipt_url', required: false, description: 'Link to a receipt image, if any' },
  { column: 'payment_method', required: false, description: 'cash, fuel_card, credit_card, company_account, or other (defaults to cash)' },
  { column: 'fuel_card_id', required: false, description: 'Required only when payment_method is fuel_card' },
];

function coerceRow(row: Record<string, string>, defaultUnitId: string): Record<string, unknown> {
  const coerced: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const raw = row[key]?.trim();
    if (!raw) continue; // omit empty optional cells rather than sending ""
    if (NUMERIC_FIELDS.has(key)) {
      const num = Number(raw);
      coerced[key] = Number.isNaN(num) ? raw : num;
    } else if (BOOLEAN_FIELDS.has(key)) {
      coerced[key] = ['true', '1', 'yes', 'y'].includes(raw.toLowerCase());
    } else {
      coerced[key] = raw;
    }
  }
  // FIX: fall back to the batch-level default only when the cell was
  // genuinely blank. A non-blank-but-wrong value is left alone so the
  // server's real validation error for that specific row still surfaces.
  if (!coerced.unit_id && defaultUnitId) {
    coerced.unit_id = defaultUnitId;
  }
  return coerced;
}

function buildExampleRow(): Record<string, string> {
  return {
    license_plate: 'ABC1234',
    date: '2026-07-01',
    fuel_volume: '45.5',
    unit_id: 'litres',
    cost: '68.20',
    odometer: '125000',
    station_name: 'Total Borrowdale',
    fuel_station_id: '',
    fuel_type: 'diesel',
    notes: '',
    currency: 'USD',
    is_full_tank: 'true',
    receipt_url: '',
    payment_method: 'fuel_card',
    fuel_card_id: '',
  };
}

function downloadCsvTemplate() {
  const csv = buildCsvText([...IMPORT_COLUMNS], [buildExampleRow()]);
  downloadCsvText(csv, 'fuel-logs-import-template.csv');
}

function downloadExcelTemplate() {
  downloadXlsxTemplate([...IMPORT_COLUMNS], [buildExampleRow()], 'fuel-logs-import-template.xlsx', 'Fuel Logs');
}

export interface FuelImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FuelImportModal({ open, onOpenChange }: FuelImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<FuelImportResponse | null>(null);
  const [showColumnHints, setShowColumnHints] = useState(false);
  const [defaultUnitId, setDefaultUnitId] = useState<string>('');
  const importMutation = useImportFuelLogs();
  const { data: volumeUnits } = useFuelVolumeUnits();

  const blankUnitCount = useMemo(
    () => rows.filter((r) => !r.unit_id || !r.unit_id.trim()).length,
    [rows]
  );
  const invalidNonBlankUnitCount = useMemo(() => {
    if (!volumeUnits) return 0;
    const validIds = new Set(volumeUnits.map((u) => u.unit_id));
    return rows.filter((r) => r.unit_id && r.unit_id.trim() && !validIds.has(r.unit_id.trim())).length;
  }, [rows, volumeUnits]);

  if (!open) return null;

  function reset() {
    setFileName(null);
    setRows([]);
    setParseError(null);
    setResult(null);
    setDefaultUnitId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setParseError(null);
    setFileName(file.name);

    try {
      const parsed = await readTabularFile(file);
      if (parsed.rows.length === 0) {
        setParseError('No data rows found in this file.');
        setRows([]);
        return;
      }
      const missingRequired = REQUIRED_COLUMNS.filter((col) => !parsed.headers.includes(col));
      if (missingRequired.length > 0) {
        setParseError(`Missing required column(s): ${missingRequired.join(', ')}`);
        setRows([]);
        return;
      }
      if (parsed.rows.length > MAX_IMPORT_ROWS) {
        setParseError(`This file has ${parsed.rows.length} rows; the maximum per import is ${MAX_IMPORT_ROWS}.`);
        setRows([]);
        return;
      }
      setRows(parsed.rows);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to read the selected file');
      setRows([]);
    }
  }

  async function handleImport() {
    if (rows.length === 0) return;
    const records = rows.map((row) => coerceRow(row, defaultUnitId));
    try {
      const response = await importMutation.mutateAsync(records);
      setResult(response);
    } catch {
      // toast already shown by the mutation's onError
    }
  }

  function handleDownloadErrors() {
    if (!result) return;
    const skippedOrFailedRows = result.results.filter((r) => !r.success);
    if (skippedOrFailedRows.length === 0) return;
    const csv = buildCsvText(
      ['row', 'identifier', 'status', 'error'],
      skippedOrFailedRows.map((r) => ({
        row: r.row,
        identifier: r.identifier ?? '',
        status: r.duplicate ? 'duplicate' : 'failed',
        error: r.error ?? '',
      }))
    );
    downloadCsvText(csv, 'fuel-logs-import-errors.csv');
  }

  const needsDefaultUnit = blankUnitCount > 0;
  const canImport = rows.length > 0 && (!needsDefaultUnit || Boolean(defaultUnitId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-2xl p-0 overflow-hidden shadow-xl surface-card">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Import Fuel Logs</h2>
          <button onClick={handleClose} className="p-1 rounded text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-2 p-3 text-sm rounded-md bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">Need the column layout? Download a starter file.</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={downloadCsvTemplate}>
                <FileDown className="h-3.5 w-3.5" /> CSV template
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadExcelTemplate}>
                <FileDown className="h-3.5 w-3.5" /> Excel template
              </Button>
            </div>
          </div>

          <div className="border rounded-md">
            <button
              type="button"
              onClick={() => setShowColumnHints((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-left"
            >
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                Required &amp; optional columns
              </span>
              <span className="text-xs text-muted-foreground">{showColumnHints ? 'Hide' : 'Show'}</span>
            </button>
            {showColumnHints && (
              <div className="overflow-x-auto border-t">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 font-medium text-left text-muted-foreground">Column</th>
                      <th className="px-3 py-2 font-medium text-left text-muted-foreground">Required</th>
                      <th className="px-3 py-2 font-medium text-left text-muted-foreground">Expected format</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COLUMN_HINTS.map((hint) => (
                      <tr key={hint.column} className="border-t">
                        <td className="px-3 py-2 font-mono">{hint.column}</td>
                        <td className="px-3 py-2">
                          {hint.required ? (
                            <span className="font-medium text-destructive">Required</span>
                          ) : (
                            <span className="text-muted-foreground">Optional</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{hint.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!showColumnHints && (
              <p className="px-3 pb-2 -mt-1 text-xs text-muted-foreground">
                Required: {REQUIRED_COLUMNS.join(', ')}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">CSV or Excel file</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMPORT_FILE_ACCEPT}
              onChange={handleFileChange}
              className="block w-full mt-1 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
            />
            <p className="mt-1 text-xs text-muted-foreground">Accepted formats: .csv, .xlsx, .xls</p>
            {fileName && !parseError && rows.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                {fileName}: {rows.length} row{rows.length === 1 ? '' : 's'} ready to import.
              </p>
            )}
            {parseError && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {parseError}
              </p>
            )}
          </div>

          {/* FIX: batch-level fallback for rows with no unit_id at all --
              the common case for consolidated/legacy spreadsheets where
              the volume unit was implicit and never entered per row. */}
          {rows.length > 0 && !result && needsDefaultUnit && (
            <div className="p-3 space-y-2 border rounded-md border-warning/40 bg-warning-bg">
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
                <div>
                  <p className="font-medium">
                    {blankUnitCount} of {rows.length} row{rows.length === 1 ? '' : 's'} {blankUnitCount === 1 ? 'has' : 'have'} no volume unit specified.
                  </p>
                  <p className="text-muted-foreground">
                    Choose a default below to apply only to those blank rows. Rows that already have a value are left as-is.
                  </p>
                </div>
              </div>
              <div className="max-w-xs">
                <Label htmlFor="default_unit_id" className="text-sm">Default volume unit</Label>
                <Select value={defaultUnitId} onValueChange={(value) => setDefaultUnitId(value ?? '')}>
                  <SelectTrigger id="default_unit_id"><SelectValue placeholder="Select a unit" /></SelectTrigger>
                  <SelectContent>
                    {volumeUnits?.map((u) => (
                      <SelectItem key={u.unit_id} value={u.unit_id}>{u.name} ({u.symbol})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {rows.length > 0 && !result && invalidNonBlankUnitCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {invalidNonBlankUnitCount} row{invalidNonBlankUnitCount === 1 ? '' : 's'} {invalidNonBlankUnitCount === 1 ? 'has' : 'have'} a unit_id value that doesn&apos;t match a registered unit — those rows will fail individually and won&apos;t use the default above. Check the error report after importing.
            </p>
          )}

          {rows.length > 0 && !result && (
            <div className="overflow-x-auto border rounded-md">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {PREVIEW_COLUMNS.map((col) => (
                      <th key={col} className="px-3 py-2 font-medium text-left text-muted-foreground">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t">
                      {PREVIEW_COLUMNS.map((col) => (
                        <td key={col} className="px-3 py-2">{row[col] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 5 && (
                <p className="px-3 py-2 text-xs border-t text-muted-foreground">
                  + {rows.length - 5} more row{rows.length - 5 === 1 ? '' : 's'}
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 text-center rounded-md bg-muted/50">
                  <div className="text-xl font-semibold">{result.summary.total}</div>
                  <div className="text-xs text-muted-foreground">Total rows</div>
                </div>
                <div className="p-3 text-center rounded-md bg-green-50 dark:bg-green-900/30">
                  <div className="text-xl font-semibold text-green-700 dark:text-green-400">{result.summary.succeeded}</div>
                  <div className="text-xs text-green-600 dark:text-green-500">Succeeded</div>
                </div>
                <div className="p-3 text-center rounded-md bg-amber-50 dark:bg-amber-900/30">
                  <div className="text-xl font-semibold text-amber-700 dark:text-amber-400">{result.summary.duplicates}</div>
                  <div className="text-xs text-amber-600 dark:text-amber-500">Duplicates skipped</div>
                </div>
                <div className="p-3 text-center rounded-md bg-red-50 dark:bg-red-900/30">
                  <div className="text-xl font-semibold text-red-700 dark:text-red-400">{result.summary.failed}</div>
                  <div className="text-xs text-red-600 dark:text-red-500">Failed</div>
                </div>
              </div>

              {(result.summary.failed > 0 || result.summary.duplicates > 0) && (
                <>
                  <div className="overflow-x-auto border rounded-md">
                    <table className="min-w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 font-medium text-left text-muted-foreground">Row</th>
                          <th className="px-3 py-2 font-medium text-left text-muted-foreground">Plate</th>
                          <th className="px-3 py-2 font-medium text-left text-muted-foreground">Status</th>
                          <th className="px-3 py-2 font-medium text-left text-muted-foreground">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.results.filter((r) => !r.success).map((r) => (
                          <tr key={r.row} className="border-t">
                            <td className="px-3 py-2">{r.row}</td>
                            <td className="px-3 py-2">{r.identifier || 'â€”'}</td>
                            <td className="px-3 py-2">
                              {r.duplicate ? (
                                <span className="font-medium text-amber-600 dark:text-amber-400">Duplicate</span>
                              ) : (
                                <span className="font-medium text-destructive">Failed</span>
                              )}
                            </td>
                            <td className={r.duplicate ? 'px-3 py-2 text-muted-foreground' : 'px-3 py-2 text-destructive'}>
                              {r.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleDownloadErrors}>
                    <FileDown className="h-3.5 w-3.5" /> Download report
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          {!result ? (
            <>
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={!canImport || importMutation.isPending}
              >
                <Upload className="h-3.5 w-3.5" />
                {importMutation.isPending ? 'Importing…' : `Import ${rows.length || ''} row${rows.length === 1 ? '' : 's'}`}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default FuelImportModal;