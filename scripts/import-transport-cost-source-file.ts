// scripts/import-transport-cost-source-file.ts
//
// Real-database counterpart to scripts/verify-phase-o3-o4.ts. That
// script proves ImportTransportCostHandler against the real January
// 2026 Olivine workbook using an in-memory FakeCollection (see its own
// header: "so this can run with no live MongoDB") -- it never wrote a
// single row to the real Olivine tenant, on purpose, as a verification
// harness. This script reuses that exact positional column mapping
// (re-verified directly against the real uploaded workbook with SheetJS
// -- the same library, not just the same numbers -- before writing this,
// not assumed to still be accurate) but calls the real production
// service layer (transportCostCommandService.importTransportCost)
// against a real, live-connected database. That is the actual gap
// between "proven correct" and "Olivine's real January numbers exist in
// the app" -- this script closes it.
//
// SCOPE, DELIBERATELY: only the three sheets that exist for January --
// "JAN-26 3rd Party", "JAN-26 Vansales", "JAN-26 Swift". This workbook
// (uploaded as "TRANSPORT COST JANUARY 2026.xlsx") also contains
// February through August, and from May onward separate Olivine/Hypery
// business-stream tabs -- NOT covered here. Those months' column
// layouts have not been individually verified against a parser the way
// January's three sheets were (see each parser's own comment below),
// and Depot STO's layout is independently known to drift across four
// different shapes March-August (see DEPOT_STO_DECISION.md and
// verify-phase-o3-o4.ts's own four Depot STO parsers). Guessing at an
// unverified month's column positions risks a silent misimport of real
// financial data -- extend SHEET_JOBS below, following this file's own
// pattern, once a later month's real columns have been checked the same
// way (open the file, dump the raw header/first rows with SheetJS,
// compare against what's assumed here -- never assume a later month
// matches January's shape without checking).
//
// WRITE SCOPE: uses systemWriteScope, not a fabricated user
// TenantContext. A CLI bulk import has no real signed-in session to
// derive org-unit scope from, and ImportTransportCostHandler already has
// a documented path for exactly this: system-scoped writes leave
// orgUnitId unresolved for every row, "to be backfilled once that path
// exists, rather than guessing" (see the handler's own header comment).
// --user-email still resolves a real tbladmin id for row-level audit
// attribution, independent of scope.kind -- same convention as
// scripts/review-normalization-queue.ts's --user-email.
//
// This script imports SOURCE EVIDENCE ONLY (Phase O1). It does not
// touch the normalization-review queue and does not post anything to
// the Allocation Ledger. Run scripts/review-normalization-queue.ts next
// for every new transporter/vehicle this creates a review item for --
// that human decision is deliberately not made here (see
// OLIVINE_DATA_IMPORT_GUIDE.md section 2).
//
// Usage:
//   npx tsx scripts/import-transport-cost-source-file.ts --org <tenantId> --file <path.xlsx> --user-email <email>
//   npx tsx scripts/import-transport-cost-source-file.ts --file <path.xlsx> --dry-run
//
// --dry-run parses every configured sheet and reports row counts only --
// no database connection is opened, no service is called, nothing is
// written. Use it first to confirm the file has the expected sheets
// before touching real data.

import 'dotenv/config';
import * as XLSX from 'xlsx';
import type {
  ThirdPartyImportRow,
  VansalesImportRow,
  SwiftImportRow,
  TransportCostImportRow,
} from '@/modules/transport-cost/commands/import-transport-cost.command';
import type { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * Mirrors shared/utils/excel-parser.utils.ts's stringifyCell exactly
 * (local Y/M/D, never toISOString(), which would shift a date-only cell
 * to the previous day for any timezone behind UTC) -- so a genuinely
 * Date-typed cell (Swift's "Cons. date" column) is fed to
 * ImportTransportCostHandler as the SAME string shape the real browser
 * upload path would produce, not a script-specific one.
 */
function stringifyDateCell(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value);
}

// ---------------------------------------------------------------------
// Per-sheet parsers. Column positions verified directly against the
// real uploaded workbook via SheetJS's own sheet_to_json({header:1})
// output before this file was written -- not carried over unchecked
// from verify-phase-o3-o4.ts, even though the result matches it exactly
// for these three January sheets.
// ---------------------------------------------------------------------

/**
 * "JAN-26 3rd Party" -- header at array index 0 (Excel row 1), data from
 * index 1. Columns: Date, Customer name, Transporter, Sales invoice no,
 * OGP ref no (unused -- no corresponding field), Tonnage, Truck
 * registration no, Destination Town, Amount.
 */
function parseThirdPartyJan(workbook: XLSX.WorkBook, sheetName: string): ThirdPartyImportRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  return raw.slice(1).map((row, i) => ({
    rowNumber: i + 2,
    date: row[0] != null ? String(row[0]) : undefined,
    customerName: row[1] != null ? String(row[1]) : undefined,
    transporter: row[2] != null ? String(row[2]) : undefined,
    salesInvoiceNo: row[3] != null ? String(row[3]) : undefined,
    tonnage: row[5] != null ? Number(row[5]) : undefined,
    registration: row[6] != null ? String(row[6]) : undefined,
    destinationTown: row[7] != null ? String(row[7]) : undefined,
    amount: row[8] != null ? Number(row[8]) : undefined,
  }));
}

/**
 * "JAN-26 Vansales" -- array index 0 is a stray pre-header cell, index 1
 * is the real header, data from index 2. Columns: PayerName, REG,
 * TONNAGE, PRODUCT, TRUCK (transporter), Monthly cost before VAT,
 * WEEK1-4, (blank column), TOTAL.
 */
function parseVansalesJan(workbook: XLSX.WorkBook, sheetName: string): VansalesImportRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  return raw.slice(2).map((row, i) => ({
    rowNumber: i + 3,
    payerName: row[0] != null ? String(row[0]) : undefined,
    registration: row[1] != null ? String(row[1]) : undefined,
    tonnage: row[2] != null ? Number(row[2]) : undefined,
    product: row[3] != null ? String(row[3]) : undefined,
    truck: row[4] != null ? String(row[4]) : undefined,
    monthlyCostBeforeVat: row[5] != null ? Number(row[5]) : undefined,
    week1: row[6] != null ? Number(row[6]) : undefined,
    week2: row[7] != null ? Number(row[7]) : undefined,
    week3: row[8] != null ? Number(row[8]) : undefined,
    week4: row[9] != null ? Number(row[9]) : undefined,
    total: row[11] != null ? Number(row[11]) : undefined,
  }));
}

/**
 * "JAN-26 Swift" -- array index 0 is a report title, index 1 is blank,
 * index 2 is the real header, data from index 3. The sheet also ends
 * with blank rows and one footer/subtotal row (identity columns null,
 * totals populated) -- deliberately NOT filtered out here, so the
 * import handler's own required-column validation (consDate/consNumber)
 * is what excludes them, proven already by
 * tests/unit/transport-cost/import-transport-cost.handler.spec.ts and
 * verify-phase-o3-o4.ts's real run against this exact sheet.
 */
function parseSwiftJan(workbook: XLSX.WorkBook, sheetName: string): SwiftImportRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  return raw.slice(3).map((row, i) => ({
    rowNumber: i + 4,
    consDate: stringifyDateCell(row[0]),
    consNumber: row[1] != null ? String(row[1]) : undefined,
    shipperReference: row[2] != null ? String(row[2]) : undefined,
    receiversName: row[3] != null ? String(row[3]) : undefined,
    destinationLocation: row[4] != null ? String(row[4]) : undefined,
    actualWeight: row[5] != null ? Number(row[5]) : undefined,
    totalExcl: row[6] != null ? Number(row[6]) : undefined,
    taxAmount: row[7] != null ? Number(row[7]) : undefined,
    totalIncl: row[8] != null ? Number(row[8]) : undefined,
  }));
}

interface SheetJob {
  family: TransportCostSheetFamily;
  sheetName: string;
  label: string;
  parse: (workbook: XLSX.WorkBook, sheetName: string) => TransportCostImportRow[];
  /** Required, "YYYY-MM", only for the 'vansales' family. */
  periodMonth?: string;
}

const SHEET_JOBS: SheetJob[] = [
  { family: 'third-party', sheetName: 'JAN-26 3rd Party', label: '3rd Party (January 2026)', parse: parseThirdPartyJan },
  {
    family: 'vansales',
    sheetName: 'JAN-26 Vansales',
    label: 'Vansales (January 2026)',
    parse: parseVansalesJan,
    periodMonth: '2026-01',
  },
  { family: 'swift', sheetName: 'JAN-26 Swift', label: 'Swift (January 2026)', parse: parseSwiftJan },
];

function nonEmptyRowCount(rows: TransportCostImportRow[]): number {
  return rows.filter((r) => {
    const entries = Object.entries(r as unknown as Record<string, unknown>);
    return entries.some(([key, value]) => key !== 'rowNumber' && value !== undefined);
  }).length;
}

async function main(): Promise<void> {
  const filePath = argValue('file');
  if (!filePath) {
    console.error('--file <path.xlsx> is required.');
    process.exit(1);
  }
  const dryRun = hasFlag('dry-run');
  const tenantId = argValue('org');
  const userEmail = argValue('user-email');

  if (!dryRun && !tenantId) {
    console.error('--org <tenantId> is required (unless --dry-run).');
    process.exit(1);
  }
  if (!dryRun && !userEmail) {
    console.error('--user-email <email> is required (unless --dry-run), so the audit trail points at a real person.');
    process.exit(1);
  }

  console.log(`\n${BOLD}Reading ${filePath}${RESET}`);
  const workbook = XLSX.readFile(filePath, { cellDates: true });

  const parsed = SHEET_JOBS.map((job) => {
    const present = workbook.SheetNames.includes(job.sheetName);
    const rows = present ? job.parse(workbook, job.sheetName) : [];
    return { job, present, rows };
  });

  console.log(`${DIM}${'='.repeat(72)}${RESET}`);
  for (const { job, present, rows } of parsed) {
    if (!present) {
      console.log(`${YELLOW}skip${RESET}  ${job.label} -- sheet "${job.sheetName}" not found in this file`);
      continue;
    }
    console.log(`${CYAN}${job.label}${RESET} -- sheet "${job.sheetName}": ${rows.length} row(s) parsed (${nonEmptyRowCount(rows)} non-blank)`);
  }
  console.log(`${DIM}${'='.repeat(72)}${RESET}\n`);

  if (dryRun) {
    console.log(`${GREEN}Dry run only -- no database connection opened, nothing written.${RESET}`);
    console.log('Re-run without --dry-run (with --org and --user-email) to actually import.');
    return;
  }

  // Only from here does this script touch a database or an external
  // service -- everything above is pure, local, and safe to re-run.
  const connectToDatabase = (await import('@/infrastructure/database/mongodb')).default;
  const { adminUserRepository } = await import('@/modules/organizations/repositories/admin-user.repository');
  const { transportCostCommandService } = await import('@/modules/transport-cost/services/transport-cost-command.service');
  const { systemWriteScope } = await import('@/server/tenancy/write-scope');
  const { bootstrapCqrs } = await import('@/server/cqrs/cqrs.module');

  await connectToDatabase();

  // FIX: transportCostCommandService.importTransportCost() dispatches
  // ImportTransportCostCommand through the shared commandBus singleton,
  // which starts with zero handlers registered -- registration normally
  // happens once via bootstrapCqrs(), called from instrumentation.ts when
  // the Next.js server boots. A standalone `npx tsx` process like this one
  // never runs instrumentation.ts, so without this explicit call every
  // import below would fail with "[CommandBus] No handler registered for
  // command ImportTransportCostCommand" -- confirmed by an actual run
  // against this real workbook before this line was added. Same class of
  // bug workers/bootstrap.ts's own header comment documents for the
  // worker process; scripts/review-normalization-queue.ts had the
  // identical gap and is fixed alongside this file. Safe to call
  // unconditionally -- bootstrapCqrs() is idempotent (guarded by
  // `global._cqrsBootstrapped`) and needs no database connection itself.
  bootstrapCqrs();

  const account = await adminUserRepository.findByEmail(userEmail!.toLowerCase());
  if (!account) {
    console.error(`No tbladmin account found for "${userEmail!.toLowerCase()}". Check spelling.`);
    process.exit(1);
  }
  const userId = account._id!.toString();

  const sourceFileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const scope = systemWriteScope(
    tenantId!,
    'CLI bulk import of a real Olivine transport-cost workbook, scripts/import-transport-cost-source-file.ts'
  );

  let anyFailed = false;

  for (const { job, present, rows } of parsed) {
    if (!present) continue;
    if (rows.length === 0) {
      console.log(`${YELLOW}${job.label}: nothing to import (0 rows parsed).${RESET}`);
      continue;
    }

    console.log(`${BOLD}Importing ${job.label}${RESET} (${rows.length} row(s))…`);
    try {
      const result = await transportCostCommandService.importTransportCost(
        job.family,
        rows,
        scope,
        sourceFileName,
        userId,
        job.periodMonth
      );
      const { succeeded, duplicates, failed } = result.summary;
      console.log(
        `  ${GREEN}${succeeded} succeeded${RESET}, ${YELLOW}${duplicates} duplicate${duplicates === 1 ? '' : 's'}${RESET}, ${failed > 0 ? RED : DIM}${failed} failed${RESET}`
      );
      if (failed > 0) {
        anyFailed = true;
        for (const r of result.results.filter((r) => !r.success && !r.duplicate)) {
          console.log(`    ${RED}row ${r.row}${RESET}: ${r.error}`);
        }
      }
    } catch (err) {
      anyFailed = true;
      console.error(`  ${RED}Import failed:${RESET}`, err instanceof Error ? err.message : err);
    }
    console.log('');
  }

  console.log(`${DIM}${'='.repeat(72)}${RESET}`);
  console.log(`${BOLD}Next step:${RESET} work the normalization review queue this import creates --`);
  console.log(`  npx tsx scripts/review-normalization-queue.ts list --org ${tenantId}`);
  console.log(`${DIM}${'='.repeat(72)}${RESET}\n`);

  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
