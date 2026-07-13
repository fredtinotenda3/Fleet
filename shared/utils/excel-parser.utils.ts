// shared/utils/excel-parser.utils.ts
//
// Excel (.xlsx / .xls) counterpart to shared/utils/csv-parser.utils.ts.
// Kept as its own module (rather than folded into csv-parser.utils.ts)
// because parsing a binary workbook is a different concern from parsing
// CSV text, but it deliberately returns the exact same `ParsedCsv` shape
// (`{ headers, rows }`, every cell already coerced to a trimmed string)
// so callers -- e.g. FuelImportModal.tsx -- can treat a CSV upload and an
// Excel upload identically once parsing is done, and pass either result
// into the same downstream validation / coerceRow / import pipeline.
//
// Uses the `xlsx` (SheetJS) package, which is already a project
// dependency (see lib/import-export.ts for the other place it's used).

import * as XLSX from 'xlsx';
import type { ParsedCsv } from './csv-parser.utils';

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
const CSV_EXTENSIONS = ['.csv'];

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

/** True if the file looks like an Excel workbook, by extension or MIME type. */
export function isExcelFile(file: File): boolean {
  return EXCEL_EXTENSIONS.includes(getExtension(file.name)) || EXCEL_MIME_TYPES.includes(file.type);
}

/** True if the file looks like a CSV file, by extension or MIME type. */
export function isCsvFile(file: File): boolean {
  return CSV_EXTENSIONS.includes(getExtension(file.name)) || file.type === 'text/csv';
}

/** Accept string for a file input that takes either CSV or Excel. */
export const IMPORT_FILE_ACCEPT =
  '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

/**
 * Turns a single Excel cell value into the same kind of trimmed string
 * that parseCsvText produces for a CSV cell, so downstream code (which
 * expects Record<string, string> and does its own Number()/boolean
 * coercion) doesn't need to know which file format the row came from.
 *
 * Date cells are formatted as YYYY-MM-DD using the *local* calendar date
 * shown in Excel, not `toISOString()` (which would shift a date-only
 * cell to the previous day for any timezone behind UTC).
 */
function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return String(value).trim();
}

/**
 * Reads a browser File as an Excel workbook and parses the first sheet
 * into a header row + array of string-keyed records, matching
 * parseCsvText's output shape exactly.
 */
export function readExcelFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          resolve({ headers: [], rows: [] });
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        // header: 1 -> array of arrays (raw cell values), so we control
        // the string coercion ourselves instead of sheet_to_json's
        // object-per-row default (which drops empty/duplicate headers
        // silently and can't distinguish "0" from "").
        const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          raw: true,
          defval: '',
        });

        const nonEmptyGrid = grid.filter((row) =>
          Array.isArray(row) && row.some((cell) => stringifyCell(cell).length > 0)
        );

        if (nonEmptyGrid.length === 0) {
          resolve({ headers: [], rows: [] });
          return;
        }

        const headers = nonEmptyGrid[0].map((cell) => stringifyCell(cell));
        const rows = nonEmptyGrid.slice(1).map((cells) => {
          const row: Record<string, string> = {};
          headers.forEach((header, index) => {
            row[header] = stringifyCell(cells[index]);
          });
          return row;
        });

        resolve({ headers, rows });
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to parse Excel file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Reads a browser File as either CSV or Excel, dispatching on file
 * extension/MIME type. This is the single entry point import UIs
 * should call; it throws for anything else so the caller can show a
 * clear "unsupported file type" message.
 */
export async function readTabularFile(file: File): Promise<ParsedCsv> {
  if (isExcelFile(file)) return readExcelFile(file);
  if (isCsvFile(file)) {
    const { readCsvFile } = await import('./csv-parser.utils');
    return readCsvFile(file);
  }
  throw new Error('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
}

/**
 * Builds and downloads an .xlsx workbook from a header list and an
 * array of records keyed by header name -- the Excel equivalent of
 * csv-parser.utils.ts's buildCsvText + downloadCsvText, for import
 * templates and error reports that a user may prefer to open in Excel
 * rather than as a CSV.
 */
export function downloadXlsxTemplate(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  filename: string,
  sheetName = 'Sheet1'
): void {
  const aoa = [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ''))];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}