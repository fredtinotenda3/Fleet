// shared/utils/csv-parser.utils.ts
//
// Small, dependency-free RFC 4180-style CSV parser/generator used by the
// enterprise import platform (frontend/shared/import/ImportModal.tsx) and
// by CSV export/error-report generation. Kept separate from
// shared/utils/csv.utils.ts (which only handles export/download of
// already-in-memory objects) because parsing untrusted uploaded text is a
// distinct concern with its own edge cases (quoted fields, embedded
// commas/newlines, CRLF).

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parses raw CSV text into a header row + array of string-keyed records.
 * Handles quoted fields (including embedded commas, newlines, and escaped
 * `""` quotes) and both CRLF and LF line endings. Every cell value is
 * returned as a trimmed string; callers are responsible for type
 * coercion (numbers, booleans, dates) since that's entity-specific.
 */
export function parseCsvText(text: string): ParsedCsv {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }

  // Flush the final field/record if the file doesn't end with a newline.
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmptyRecords = records.filter((r) => r.some((cell) => cell.trim().length > 0));
  if (nonEmptyRecords.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = nonEmptyRecords[0].map((h) => h.trim());
  const rows = nonEmptyRecords.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim();
    });
    return row;
  });

  return { headers, rows };
}

/** Reads a browser File (from a drag-drop zone or <input type="file">) and parses it as CSV. */
export function readCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseCsvText(String(reader.result ?? '')));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to parse CSV file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file'));
    reader.readAsText(file);
  });
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Builds CSV text from a header list and an array of records keyed by header name. */
export function buildCsvText(headers: string[], rows: Array<Record<string, unknown>>): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const lines = rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(','));
  return [headerLine, ...lines].join('\n');
}

/** Triggers a browser download of the given CSV text. */
export function downloadCsvText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}