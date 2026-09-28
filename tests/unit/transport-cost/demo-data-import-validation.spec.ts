// tests/unit/transport-cost/demo-data-import-validation.spec.ts
//
// OLIVINE LIVE READINESS PASS, Oct 2026 cutover. Verifies the shipped
// demo workbooks (demo-data/olivine_demo_*.xlsx) actually parse and
// validate cleanly through the REAL import pipeline -- not a
// reimplementation of the validation rules, the genuine
// ImportTransportCostHandler private validateAndBuildX methods, called
// exactly like ImportTransportCostCommand.execute calls them. This is
// the evidence behind "the demo Excel matches the app's actual current
// import schema" rather than a claim taken on faith.
//
// Mirrors, deliberately by hand (not by importing ImportModal.tsx,
// which is a .tsx file this project's JSX-less Jest config cannot load
// -- see operation-data-quality.utils.ts's own header for that
// constraint), exactly two things ImportModal.tsx already does for a
// real upload:
//   1. shared/utils/excel-parser.utils.ts's `readExcelFile`: parses
//      only the workbook's FIRST sheet, via the same `xlsx` package,
//      with the same `header: 1` + manual header-row handling.
//   2. ImportModal.buildRecordsForSubmission's `coerceValue`: converts
//      a 'number' column's cell to a real JS number (or leaves it
//      `undefined` when blank), matching what the browser actually
//      POSTs.
//
// A genuine schema drift (someone renames/re-types an
// ImportColumnDef.key without regenerating the demo data) fails this
// test with a specific row/column, not a vague "the demo didn't work"
// discovered live in front of the client.

import * as XLSX from 'xlsx';
import * as path from 'path';
import { ImportTransportCostHandler } from '../../../modules/transport-cost/commands/handlers/import-transport-cost.handler';

const DEMO_DIR = path.join(__dirname, '../../../demo-data');

type ColumnType = 'string' | 'number' | 'boolean' | 'select' | 'search-select';

// Mirrors ImportModal's coerceValue exactly (see this file's header).
function coerceValue(raw: string, type: ColumnType | undefined): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  if (type === 'number') {
    const num = Number(trimmed);
    return Number.isNaN(num) ? trimmed : num;
  }
  return trimmed;
}

// Column key -> type, taken directly from TransportCostImportPage.tsx's
// own column definitions (THIRD_PARTY_COLUMNS / SWIFT_COLUMNS /
// VANSALES_COLUMNS / DEPOT_STO_COLUMNS) -- the same source of truth the
// demo workbook's headers were built from.
const THIRD_PARTY_TYPES: Record<string, ColumnType> = {
  date: 'string', costFacingCompany: 'select', customerName: 'string', transporter: 'string',
  salesInvoiceNo: 'string', tonnage: 'number', registration: 'string', destinationTown: 'string', amount: 'number',
};
const SWIFT_TYPES: Record<string, ColumnType> = {
  consDate: 'string', costFacingCompany: 'select', consNumber: 'string', shipperReference: 'string',
  receiversName: 'string', destinationLocation: 'string', actualWeight: 'number',
  totalExcl: 'number', taxAmount: 'number', totalIncl: 'number',
};
const VANSALES_TYPES: Record<string, ColumnType> = {
  payerName: 'string', costFacingCompany: 'select', registration: 'string', tonnage: 'number', product: 'string',
  truck: 'string', monthlyCostBeforeVat: 'number', week1: 'number', week2: 'number', week3: 'number',
  week4: 'number', total: 'number',
};
const DEPOT_STO_TYPES: Record<string, ColumnType> = {
  date: 'string', costFacingCompany: 'select', customerName: 'string', transporter: 'string',
  salesInvoiceNo: 'string', tonnage: 'number', registration: 'string', destinationTown: 'string', amount: 'number',
};

/** Reads only the workbook's first sheet -- matches readExcelFile's own `workbook.SheetNames[0]` behaviour. */
function readFirstSheetAsRows(filePath: string, types: Record<string, ColumnType>): Array<Record<string, unknown>> {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
  const [headerRow, ...dataRows] = grid as unknown[][];
  const headers = headerRow.map((h) => String(h));

  return dataRows
    .filter((r) => r.some((c) => c !== undefined && c !== null && String(c).trim() !== ''))
    .map((r, i) => {
      const record: Record<string, unknown> = { rowNumber: i + 2 };
      headers.forEach((h, colIdx) => {
        const raw = r[colIdx];
        const asString = raw === undefined || raw === null ? '' : String(raw).trim();
        const value = coerceValue(asString, types[h]);
        if (value !== undefined) record[h] = value;
      });
      return record;
    });
}

// The handler's `repo`/`matcher`/`exceptionRepo` constructor params are
// only touched by execute()/insertOrFlag()/logException() -- never by
// the validateAndBuildX methods this test calls directly -- so a bare
// stub is enough to construct the class.
function makeHandler(): ImportTransportCostHandler {
  return new (ImportTransportCostHandler as unknown as new (repo: unknown) => ImportTransportCostHandler)({});
}

describe('demo-data workbooks validate cleanly through the real import handler', () => {
  it('every 3rd Party demo row passes validateAndBuildThirdParty', () => {
    const rows = readFirstSheetAsRows(path.join(DEMO_DIR, 'olivine_demo_3rd_party.xlsx'), THIRD_PARTY_TYPES);
    expect(rows.length).toBeGreaterThan(15);
    const handler = makeHandler() as unknown as {
      validateAndBuildThirdParty: (row: unknown, rowNum: number) => { ok: boolean; error?: unknown };
    };
    const failures = rows
      .map((row) => ({ row, result: handler.validateAndBuildThirdParty(row, row.rowNumber as number) }))
      .filter((r) => !r.result.ok);
    expect(failures.map((f) => ({ row: f.row, error: f.result.error }))).toEqual([]);
  });

  it('every Swift demo row passes validateAndBuildSwift', () => {
    const rows = readFirstSheetAsRows(path.join(DEMO_DIR, 'olivine_demo_swift.xlsx'), SWIFT_TYPES);
    expect(rows.length).toBeGreaterThan(10);
    const handler = makeHandler() as unknown as {
      validateAndBuildSwift: (row: unknown, rowNum: number) => { ok: boolean; error?: unknown };
    };
    const failures = rows
      .map((row) => ({ row, result: handler.validateAndBuildSwift(row, row.rowNumber as number) }))
      .filter((r) => !r.result.ok);
    expect(failures.map((f) => ({ row: f.row, error: f.result.error }))).toEqual([]);
  });

  it('every Vansales demo row passes validateAndBuildVansales for period 2026-10', () => {
    const rows = readFirstSheetAsRows(path.join(DEMO_DIR, 'olivine_demo_vansales.xlsx'), VANSALES_TYPES);
    expect(rows.length).toBeGreaterThan(5);
    const handler = makeHandler() as unknown as {
      validateAndBuildVansales: (row: unknown, rowNum: number, periodMonth: string) => { ok: boolean; error?: unknown };
    };
    const failures = rows
      .map((row) => ({ row, result: handler.validateAndBuildVansales(row, row.rowNumber as number, '2026-10') }))
      .filter((r) => !r.result.ok);
    expect(failures.map((f) => ({ row: f.row, error: f.result.error }))).toEqual([]);
  });

  it('every Depot STO demo row passes validateAndBuildDepotSto', () => {
    const rows = readFirstSheetAsRows(path.join(DEMO_DIR, 'olivine_demo_depot_sto.xlsx'), DEPOT_STO_TYPES);
    expect(rows.length).toBeGreaterThan(8);
    const handler = makeHandler() as unknown as {
      validateAndBuildDepotSto: (row: unknown, rowNum: number) => { ok: boolean; error?: unknown };
    };
    const failures = rows
      .map((row) => ({ row, result: handler.validateAndBuildDepotSto(row, row.rowNumber as number) }))
      .filter((r) => !r.result.ok);
    expect(failures.map((f) => ({ row: f.row, error: f.result.error }))).toEqual([]);
  });

  it('the intentionally-blank-amount 3rd Party demo row still validates (amount is optional, never coerced to 0)', () => {
    const rows = readFirstSheetAsRows(path.join(DEMO_DIR, 'olivine_demo_3rd_party.xlsx'), THIRD_PARTY_TYPES);
    const blankAmountRow = rows.find((r) => r.registration === 'AEZ3117' && r.customerName === 'Supernova');
    expect(blankAmountRow).toBeDefined();
    expect(blankAmountRow!.amount).toBeUndefined();
    const handler = makeHandler() as unknown as {
      validateAndBuildThirdParty: (row: unknown, rowNum: number) => { ok: boolean; record?: { amount: number | null } };
    };
    const result = handler.validateAndBuildThirdParty(blankAmountRow, blankAmountRow!.rowNumber as number);
    expect(result.ok).toBe(true);
    expect(result.record!.amount).toBeNull();
  });

  it('all three cost-facing companies (Hypery, Olivine, Surface) appear across the demo dataset', () => {
    const families = ['olivine_demo_3rd_party.xlsx', 'olivine_demo_swift.xlsx', 'olivine_demo_vansales.xlsx', 'olivine_demo_depot_sto.xlsx'];
    const types = [THIRD_PARTY_TYPES, SWIFT_TYPES, VANSALES_TYPES, DEPOT_STO_TYPES];
    const seen = new Set<string>();
    families.forEach((f, i) => {
      readFirstSheetAsRows(path.join(DEMO_DIR, f), types[i]).forEach((r) => {
        if (typeof r.costFacingCompany === 'string') seen.add(r.costFacingCompany.toLowerCase());
      });
    });
    expect(seen).toEqual(new Set(['hypery', 'olivine', 'surface']));
  });
});
