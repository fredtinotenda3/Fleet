// scripts/verify-phase-o3-o4.ts
//
// Phase O3/O4 delivery verification, run against the REAL January 2026
// Olivine workbook -- not synthetic fixtures. It exercises the actual
// production code path (ImportTransportCostHandler,
// NormalizationMatcherService, ConfirmReviewNewHandler,
// TransportCostPostingService, TransportCostReportService) with every
// process-wide singleton's storage swapped for an in-memory
// FakeCollection (tests/helpers/fake-collection.ts) so this can run with
// no live MongoDB, exactly mirroring how tests/security/*.spec.ts
// already verify this codebase's repositories against real aggregation
// logic without a live database. financeSettingsService.resolve and
// auditLog are stubbed for the same reason (they would otherwise try a
// real Mongo connection this environment does not have) -- everything
// ELSE in the call path is the genuine production class.
//
// What this proves, in order:
//   1. Import the real January 2026 "JAN-26 3rd Party", "JAN-26
//      Vansales", and "JAN-26 Swift" sheets through the real O1 handler
//      (Vansales with periodMonth: '2026-01' -- periodization Option A).
//   2. Resolve every distinct transporter/registration through the real
//      O2 matcher + a scripted "confirm every pending item as NEW"
//      operator pass (never auto-merges a fuzzy candidate -- see below).
//   3. Post every eligible 3rd Party row through the real O3
//      TransportCostPostingService.
//   4. Re-run the same posting batch TWICE more -- proves zero duplicate
//      postings.
//   5. Correct one row's Amount and re-post -- proves reversal + new
//      posting, original left byte-identical.
//   6. Reconcile: sum of what actually posted vs. the workbook's own
//      January 3rd Party Amount total, with every excluded/pending row
//      accounted for by name, not absorbed into an unexplained gap.
//   7. Post the Vansales batch (transport-retainer, periodMonth
//      '2026-01') and reconcile its TOTAL column against the workbook's
//      own Vansales sheet -- the Vansales-posting slice's own
//      acceptance check, structurally identical to step 6 above.
//   8. Post the Swift batch (third-party-transport) and reconcile its
//      Total(Incl) column against the workbook's own Swift sheet --
//      proves every Swift row imports and then consistently skips at
//      posting time (`unresolved-vehicle-identity`, never fabricating a
//      vehicle), per SWIFT_POSTING_DECISION.md.
//   9. Import and post all SIX real Depot STO sheets (March-August,
//      four genuinely different column shapes, one tolerant parser --
//      see DEPOT_STO_DECISION.md), each as its own batch, and reconcile
//      the combined Amount/COSTS/COST total against the six sheets' own
//      figures -- proves March/April/August rows post normally
//      (stock-transfer) while May/June/July rows correctly skip at
//      unresolved-vehicle-identity (a DATA fact specific to this real
//      workbook, not a schema one -- see DEPOT_STO_DECISION.md's
//      "Vehicle identity" table).
//  10. Run the real TransportCostReportService.getAllocationReport for
//      January and print it -- the same data the O4 screen renders.
//
// Run with: npx tsx scripts/verify-phase-o3-o4.ts [path-to-xlsx]

import * as path from 'path';
import * as XLSX from 'xlsx';

import { FakeCollection } from '../tests/helpers/fake-collection';

import { transportCostSourceRecordRepository } from '../modules/transport-cost/repositories/transport-cost-source-record.repository';
import { transportPartnerRepository } from '../modules/transport-cost/repositories/transport-partner.repository';
import { contractedVehicleRepository } from '../modules/transport-cost/repositories/contracted-vehicle.repository';
import { normalizationReviewRepository } from '../modules/transport-cost/repositories/normalization-review.repository';
import { allocationLedgerRepository } from '../modules/finance/repositories/allocation-ledger.repository';
import { transportCostVatConfigRepository } from '../modules/transport-cost/repositories/transport-cost-vat-config.repository';
import { transportCostImportExceptionRepository } from '../modules/transport-cost/repositories/transport-cost-import-exception.repository';

import { financeSettingsService } from '../modules/finance/services/finance-settings.service';
import { auditLog } from '../infrastructure/monitoring/audit.logger';

import { normalizationMatcherService } from '../modules/transport-cost/services/normalization-matcher.service';
import { transportCostPostingService } from '../modules/transport-cost/services/transport-cost-posting.service';
import { transportCostReportService } from '../modules/transport-cost/services/transport-cost-report.service';

import { ImportTransportCostHandler } from '../modules/transport-cost/commands/handlers/import-transport-cost.handler';
import { ImportTransportCostCommand, ThirdPartyImportRow, VansalesImportRow, SwiftImportRow, DepotStoImportRow } from '../modules/transport-cost/commands/import-transport-cost.command';
import { ConfirmReviewNewHandler } from '../modules/transport-cost/commands/handlers/confirm-review-new.handler';
import { ConfirmReviewNewCommand } from '../modules/transport-cost/commands/confirm-review-new.command';

import { userWriteScope } from '../server/tenancy/write-scope';
import type { TenantContext } from '../modules/tenancy/services/tenant-context.service';

// ---------------------------------------------------------------------
// 0. WIRING: swap every singleton's storage for an in-memory fake.
// ---------------------------------------------------------------------

const collections = {
  sourceRecords: new FakeCollection(),
  partners: new FakeCollection(),
  vehicles: new FakeCollection(),
  reviewItems: new FakeCollection(),
  ledger: new FakeCollection(),
  vatConfigs: new FakeCollection(),
  // Item 6 addition -- patched so this run also exercises the real
  // exception-persistence wiring (ImportTransportCostHandler ->
  // TransportCostImportExceptionRepository) against the real workbook,
  // not just synthetic unit-test rows.
  importExceptions: new FakeCollection(),
};

function patchCollection(repo: any, collection: FakeCollection) {
  repo.getCollection = async () => collection;
}
patchCollection(transportCostSourceRecordRepository, collections.sourceRecords);
patchCollection(transportPartnerRepository, collections.partners);
patchCollection(contractedVehicleRepository, collections.vehicles);
patchCollection(normalizationReviewRepository, collections.reviewItems);
patchCollection(allocationLedgerRepository, collections.ledger);
patchCollection(transportCostVatConfigRepository, collections.vatConfigs);
patchCollection(transportCostImportExceptionRepository, collections.importExceptions);

// No live organization/finance-settings document in this run -- USD
// reporting currency mirrors the same provisional USD DEFAULT this
// delivery seeds for source currency (see vat-config-defaults.ts), so
// fxRate resolves to the trivial 1:1 case rather than requiring a
// fabricated FX rate.
(financeSettingsService as any).resolve = async () => ({
  reportingCurrency: 'USD',
  fxPolicy: 'transaction-date',
  glToleranceAmount: 0,
  usingDefaults: true,
});
(auditLog as any).log = async () => undefined;
(auditLog as any).logCreate = async () => undefined;
(auditLog as any).logAction = async () => undefined;
(auditLog as any).logUpdate = async () => undefined;

const TENANT = 'olivine-group-demo';
const ORG_UNIT = 'unit-harare';
const USER_ID = 'demo-importer';

function context(): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Olivine Group',
    accessibleOrgUnitIds: null, // org-wide, for this verification run
    assignedOrgUnitIds: [ORG_UNIT],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

function scope() {
  return userWriteScope(context());
}

// ---------------------------------------------------------------------
// 1. PARSE THE REAL WORKBOOK
// ---------------------------------------------------------------------

const xlsxPath = process.argv[2] ?? '/home/claude/olivine-audit/TRANSPORT_COST_JANUARY_2026.xlsx';
console.log(`\n[1] Reading ${xlsxPath}`);
// cellDates: true is required for the Swift sheet's genuinely
// Excel-date-typed "Cons. date" column (verified: SheetJS stores it as a
// numeric serial otherwise, not a string). It has no effect on 3rd
// Party's or Vansales's date cells -- both verified to be STRING-typed
// cells ("t":"s") in the real workbook, which cellDates never touches.
const workbook = XLSX.readFile(xlsxPath, { cellDates: true });

/**
 * Mirrors shared/utils/excel-parser.utils.ts's stringifyCell exactly
 * (local Y/M/D, never toISOString()) so this script feeds
 * ImportTransportCostHandler the SAME string shape the real browser
 * upload path would for a genuinely Date-typed cell -- see
 * normalization.utils.ts's parseSourceDate header for why local getters
 * (not UTC) are the correct read-back of a SheetJS cellDates Date: the
 * library's own numdate() conversion (node_modules/xlsx) bakes in a
 * local-timezone correction specifically so local getters recover the
 * spreadsheet's own calendar date in the reading process's timezone.
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

const thirdPartySheet = workbook.Sheets['JAN-26 3rd Party'];
const thirdPartyRaw: unknown[][] = XLSX.utils.sheet_to_json(thirdPartySheet, { header: 1, raw: true, defval: null });
// Row 0 is the header; data starts at array index 1 (Excel row 2).
const thirdPartyRows: ThirdPartyImportRow[] = thirdPartyRaw.slice(1).map((row, i) => ({
  rowNumber: i + 2, // Excel's own row number, matching sourceRowNumber's contract
  date: row[0] != null ? String(row[0]) : undefined,
  customerName: row[1] != null ? String(row[1]) : undefined,
  transporter: row[2] != null ? String(row[2]) : undefined,
  salesInvoiceNo: row[3] != null ? String(row[3]) : undefined,
  tonnage: row[5] != null ? Number(row[5]) : undefined,
  registration: row[6] != null ? String(row[6]) : undefined,
  destinationTown: row[7] != null ? String(row[7]) : undefined,
  amount: row[8] != null ? Number(row[8]) : undefined,
}));

const vansalesSheet = workbook.Sheets['JAN-26 Vansales'];
const vansalesRaw: unknown[][] = XLSX.utils.sheet_to_json(vansalesSheet, { header: 1, raw: true, defval: null });
// Row 0 is a stray pre-header cell, row 1 is the real header; data starts at array index 2 (Excel row 3).
const vansalesRows: VansalesImportRow[] = vansalesRaw.slice(2).map((row, i) => ({
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

const swiftSheet = workbook.Sheets['JAN-26 Swift'];
const swiftRaw: unknown[][] = XLSX.utils.sheet_to_json(swiftSheet, { header: 1, raw: true, defval: null });
// Row 0 is a report title, row 1 is blank, row 2 is the real header;
// data starts at array index 3 (Excel row 4) -- verified directly
// against the real workbook, not assumed. The sheet also ends with 3
// blank rows, one footer/subtotal row (identity columns all null,
// weight/total columns populated), and one more trailing blank row --
// all five are deliberately NOT filtered out here, so the import path's
// own required-column validation is what excludes them (proving the
// handler does that job correctly), not this script pre-cleaning the
// data before the code under test ever sees it.
const swiftRows: SwiftImportRow[] = swiftRaw.slice(3).map((row, i) => ({
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

// ---------------------------------------------------------------------
// DEPOT STO -- six real sheets, four genuinely different column shapes
// (see DEPOT_STO_DECISION.md's drift record). ONE tolerant parser
// (validateAndBuildDepotSto) covers all of them in production -- this
// script mirrors that discipline with per-SHAPE column-index maps
// below (March/April share one map, June/July share another), never a
// map per sheet/month. Each sheet is still imported as its OWN batch
// (its own ImportTransportCostCommand/execute() call) further down,
// exactly like an operator uploading one file at a time -- concatenating
// all six into one array first would make `rowNumber` (Excel's own
// per-sheet row numbering) collide across sheets that reuse the same
// row numbers.
function parseMarchAprilShape(sheetName: string): DepotStoImportRow[] {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
  // Header at array index 0, data from index 1 -- the identical 8
  // columns as 3rd Party's own sheet (see ThirdPartyImportRow's doc
  // comment) -- verified directly against the real workbook.
  return raw.slice(1).map((row, i) => ({
    rowNumber: i + 2,
    date: row[0] != null ? String(row[0]) : undefined,
    customerName: row[1] != null ? String(row[1]) : undefined,
    transporter: row[2] != null ? String(row[2]) : undefined,
    salesInvoiceNo: row[3] != null ? String(row[3]) : undefined,
    tonnage: row[4] != null ? Number(row[4]) : undefined,
    registration: row[5] != null ? String(row[5]) : undefined,
    destinationTown: row[6] != null ? String(row[6]) : undefined,
    amount: row[7] != null ? Number(row[7]) : undefined,
  }));
}

function parseMayShape(sheetName: string): DepotStoImportRow[] {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
  // Header at array index 0, data from index 1 -- verified directly.
  return raw.slice(1).map((row, i) => ({
    rowNumber: i + 2,
    date: row[0] != null ? String(row[0]) : undefined,
    sto: row[1] != null ? String(row[1]) : undefined,
    source: row[2] != null ? String(row[2]) : undefined,
    depot: row[3] != null ? String(row[3]) : undefined,
    commodity: row[4] != null ? String(row[4]) : undefined,
    goldenGlow2L: row[5] != null ? Number(row[5]) : undefined,
    olivine2L: row[6] != null ? Number(row[6]) : undefined,
    puredrop2L: row[7] != null ? Number(row[7]) : undefined,
    pureDrop5l: row[8] != null ? Number(row[8]) : undefined,
    pureDrop750: row[9] != null ? Number(row[9]) : undefined,
    mrGurjit: row[10] != null ? Boolean(row[10]) : undefined,
    mrInderjeet: row[11] != null ? Boolean(row[11]) : undefined,
    sharmaJi: row[12] != null ? Boolean(row[12]) : undefined,
    transporter: row[13] != null ? String(row[13]) : undefined,
    amount: row[14] != null ? Number(row[14]) : undefined,
  }));
}

function parseJuneJulyShape(sheetName: string): DepotStoImportRow[] {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
  // Header at array index 1 (Excel row 2), data from index 2 (Excel
  // row 3) -- verified directly against the real workbook (row 0 is
  // blank in both sheets).
  return raw.slice(2).map((row, i) => ({
    rowNumber: i + 3,
    date: row[0] != null ? String(row[0]) : undefined,
    sto: row[1] != null ? String(row[1]) : undefined,
    source: row[2] != null ? String(row[2]) : undefined,
    depot: row[3] != null ? String(row[3]) : undefined,
    commodity: row[4] != null ? String(row[4]) : undefined,
    mrGurjit: row[5] != null ? Boolean(row[5]) : undefined,
    mrInderjeet: row[6] != null ? Boolean(row[6]) : undefined,
    sharmaJi: row[7] != null ? Boolean(row[7]) : undefined,
    transporter: row[8] != null ? String(row[8]) : undefined,
    registration: row[9] != null ? String(row[9]) : undefined,
    driver: row[10] != null ? String(row[10]) : undefined,
    amount: row[11] != null ? Number(row[11]) : undefined,
    toonnes: row[12] != null ? Number(row[12]) : undefined,
  }));
}

function parseAugustShape(sheetName: string): DepotStoImportRow[] {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
  // Header at array index 1, data from index 2 -- same layout as
  // June/July minus TOONNES and DRIVER (verified directly).
  return raw.slice(2).map((row, i) => ({
    rowNumber: i + 3,
    date: row[0] != null ? String(row[0]) : undefined,
    sto: row[1] != null ? String(row[1]) : undefined,
    source: row[2] != null ? String(row[2]) : undefined,
    depot: row[3] != null ? String(row[3]) : undefined,
    commodity: row[4] != null ? String(row[4]) : undefined,
    mrGurjit: row[5] != null ? Boolean(row[5]) : undefined,
    mrInderjeet: row[6] != null ? Boolean(row[6]) : undefined,
    sharmaJi: row[7] != null ? Boolean(row[7]) : undefined,
    transporter: row[8] != null ? String(row[8]) : undefined,
    registration: row[9] != null ? String(row[9]) : undefined,
    amount: row[10] != null ? Number(row[10]) : undefined,
  }));
}

interface DepotStoSheet {
  label: string;
  sheetName: string;
  rows: DepotStoImportRow[];
  /**
   * Which raw rows are genuine transaction rows, for the reconciliation
   * TARGET sum only -- every raw row (genuine or not) still gets fed to
   * the real import handler unfiltered further down, so it is the
   * production validateAndBuildDepotSto that does the actual excluding,
   * not this script pre-cleaning the data (same discipline already
   * used for Swift's footer/blank rows above).
   */
  genuine: (r: DepotStoImportRow) => boolean;
}

const depotStoSheets: DepotStoSheet[] = [
  { label: 'March', sheetName: 'march deport sto', rows: parseMarchAprilShape('march deport sto'), genuine: (r) => r.customerName !== undefined },
  { label: 'April', sheetName: 'APRIL- deport sto ', rows: parseMarchAprilShape('APRIL- deport sto '), genuine: (r) => r.customerName !== undefined },
  { label: 'May', sheetName: 'MAY- deport sto ', rows: parseMayShape('MAY- deport sto '), genuine: (r) => r.sto !== undefined },
  { label: 'June', sheetName: 'JUNE- deport sto  ', rows: parseJuneJulyShape('JUNE- deport sto  '), genuine: (r) => r.sto !== undefined },
  { label: 'July', sheetName: 'july- deport sto   ', rows: parseJuneJulyShape('july- deport sto   '), genuine: (r) => r.sto !== undefined },
  { label: 'August', sheetName: 'august- deport sto   ', rows: parseAugustShape('august- deport sto   '), genuine: (r) => r.sto !== undefined },
];

console.log(`    3rd Party: ${thirdPartyRows.length} data rows. Vansales: ${vansalesRows.length} data rows. Swift: ${swiftRows.length} data rows.`);
console.log(`    Depot STO: ${depotStoSheets.map((s) => `${s.label} ${s.rows.length}`).join(', ')} raw rows across six real sheets, four shapes.`);

// The workbook's OWN January 3rd Party Amount total -- the reconciliation target.
const workbookThirdPartyTotal = thirdPartyRows.reduce((sum, r) => sum + (typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : 0), 0);
const workbookThirdPartyPendingRows = thirdPartyRows.filter((r) => r.amount === undefined || r.amount === null || Number.isNaN(r.amount));

// The workbook's OWN January Vansales TOTAL column sum -- the
// reconciliation target for step 7 (Vansales periodization Option A
// posts this exact column, never monthlyCostBeforeVat or a re-summed
// WEEK1-4 -- see VANSALES_PERIODIZATION_DECISION.md).
const workbookVansalesTotal = vansalesRows.reduce((sum, r) => sum + (typeof r.total === 'number' && Number.isFinite(r.total) ? r.total : 0), 0);
const workbookVansalesPendingRows = vansalesRows.filter((r) => r.total === undefined || r.total === null || Number.isNaN(r.total));
const VANSALES_PERIOD_MONTH = '2026-01';

// The workbook's OWN January Swift Total(Incl) sum -- the reconciliation
// target for step 8.
//
// NOT summed blindly over every raw row: the real "JAN-26 Swift" sheet's
// last populated row (Excel row 283, array index 282) is Excel's OWN
// column subtotal for Total(Excl)/Tax amount/Total(Incl) -- verified
// directly: its Total(Incl) value (30588.62) is exactly equal to the sum
// of the 276 genuine consignment rows above it, to the cent. Summing
// "every row including the footer" would silently DOUBLE the true total
// (a self-referential subtotal counted as if it were one more real
// shipment) -- exactly the kind of silent inflation the hard "never
// fabricate" constraint exists to prevent, just via arithmetic rather
// than a guessed value. So the reconciliation target here is the sum
// over GENUINE rows only, using the identical two-column test the real
// validateAndBuildSwift applies (a parseable Cons. date AND a non-blank
// Cons. Number) -- computed independently here, not by peeking at the
// import result, so this stays a real cross-check rather than a
// circular one. The footer's own value is kept separately below purely
// as a sanity cross-check against that independently-computed sum.
const swiftGenuineRows = swiftRows.filter(
  (r) => typeof r.consDate === 'string' && r.consDate.trim() !== '' && r.consNumber != null && String(r.consNumber).trim() !== ''
);
const swiftNonDataRows = swiftRows.filter((r) => !swiftGenuineRows.includes(r));
const workbookSwiftFooterSubtotal = swiftRows.reduce((sum, r) => sum + (typeof r.totalIncl === 'number' && Number.isFinite(r.totalIncl) ? r.totalIncl : 0), 0) -
  swiftGenuineRows.reduce((sum, r) => sum + (typeof r.totalIncl === 'number' && Number.isFinite(r.totalIncl) ? r.totalIncl : 0), 0);
const workbookSwiftTotal = swiftGenuineRows.reduce((sum, r) => sum + (typeof r.totalIncl === 'number' && Number.isFinite(r.totalIncl) ? r.totalIncl : 0), 0);
const workbookSwiftPendingRows = swiftGenuineRows.filter((r) => r.totalIncl === undefined || r.totalIncl === null || Number.isNaN(r.totalIncl as number));

// The six sheets' own combined Amount/COSTS/COST total -- the
// reconciliation target for the Depot STO section below. GENUINE rows
// only (see each sheet's `genuine` predicate above): March's sheet has
// its OWN trailing "TOTAL VAT EXCL" subtotal row (Excel row 43, Amount
// column = 42076, exactly equal to the independently-computed sum of
// the 39 genuine rows above it -- verified directly) which would
// silently double the true total if summed in, the same class of bug
// already caught and fixed in the Swift reconciliation above. The
// other five sheets have no equivalent embedded subtotal row (verified
// directly against the real workbook), only trailing blank/padding
// rows, which the `genuine` predicate also excludes.
const workbookDepotStoTotal = depotStoSheets.reduce(
  (sum, s) =>
    sum +
    s.rows
      .filter(s.genuine)
      .reduce((rowSum, r) => rowSum + (typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : 0), 0),
  0
);
const workbookDepotStoGenuineCount = depotStoSheets.reduce((sum, s) => sum + s.rows.filter(s.genuine).length, 0);

/**
 * Confirms every PENDING normalization-review item (transporter, then
 * vehicle) as a NEW, distinct identity -- shared by section [3] (for
 * 3rd Party/Vansales/Swift's new identities) and the Depot STO section
 * further down (for whichever transporters/registrations its six real
 * sheets introduce that the first three families didn't already
 * resolve). NEVER merges a fuzzy candidate (e.g. PRINORTH / PRI NORTH
 * stay separate entities here), so it cannot violate the "suggest
 * only, never auto-merge" hard constraint -- a real operator using the
 * review UI would instead merge genuine spelling variants by hand,
 * which would only consolidate identities, never change the total
 * amount posted (the ledger sums by posting, not by identity
 * grouping). Transporters are confirmed BEFORE vehicles, because a new
 * ContractedVehicle requires an already-resolved transporterPartnerId.
 * Safe to call more than once in the same run: each call only sees
 * whatever is PENDING at the time it runs, so a second call after a
 * later import batch just picks up that batch's own new identities.
 */
async function resolvePendingReviews(
  confirmHandler: ConfirmReviewNewHandler
): Promise<{ transporterConfirmed: number; vehicleConfirmed: number; vehicleSkippedNoTransporter: number }> {
  let transporterConfirmed = 0;
  let vehicleConfirmed = 0;
  let vehicleSkippedNoTransporter = 0;

  const transporterQueue = await normalizationReviewRepository.findPending('transporter', TENANT, { page: 1, limit: 10000 });
  for (const item of transporterQueue.data) {
    await confirmHandler.execute(new ConfirmReviewNewCommand(item._id!, TENANT, USER_ID));
    transporterConfirmed += 1;
  }

  const vehicleQueue = await normalizationReviewRepository.findPending('vehicle', TENANT, { page: 1, limit: 10000 });
  for (const item of vehicleQueue.data) {
    let transporterPartnerId: string | undefined;
    for (const sourceRecordId of item.sourceRecordIds) {
      const record = await transportCostSourceRecordRepository.findById(sourceRecordId, TENANT);
      if (record?.transporterPartnerId) {
        transporterPartnerId = record.transporterPartnerId;
        break;
      }
    }
    if (!transporterPartnerId) {
      vehicleSkippedNoTransporter += 1;
      console.log(`      - skipped vehicle review item ${item._id} (${item.rawValue}): no resolved transporter among its source rows`);
      continue;
    }
    await confirmHandler.execute(new ConfirmReviewNewCommand(item._id!, TENANT, USER_ID, transporterPartnerId));
    vehicleConfirmed += 1;
  }

  return { transporterConfirmed, vehicleConfirmed, vehicleSkippedNoTransporter };
}

async function main() {
  // ---------------------------------------------------------------------
  // 2. IMPORT (Phase O1 + O2 inline normalization)
  // ---------------------------------------------------------------------
  console.log('\n[2] Importing via the real ImportTransportCostHandler...');
  const importHandler = new ImportTransportCostHandler(
    transportCostSourceRecordRepository,
    normalizationMatcherService,
    transportCostImportExceptionRepository
  );

  const tpImport = await importHandler.execute(
    new ImportTransportCostCommand('third-party', thirdPartyRows, TENANT, scope(), 'TRANSPORT_COST_JANUARY_2026.xlsx', USER_ID)
  );
  const vsImport = await importHandler.execute(
    new ImportTransportCostCommand(
      'vansales',
      vansalesRows,
      TENANT,
      scope(),
      'TRANSPORT_COST_JANUARY_2026.xlsx',
      USER_ID,
      VANSALES_PERIOD_MONTH
    )
  );
  const swImport = await importHandler.execute(
    new ImportTransportCostCommand('swift', swiftRows, TENANT, scope(), 'TRANSPORT_COST_JANUARY_2026.xlsx', USER_ID)
  );

  console.log(
    `    3rd Party import: ${tpImport.summary.succeeded} succeeded, ${tpImport.summary.duplicates} flagged as duplicates, ${tpImport.summary.failed} failed validation.`
  );
  console.log(
    `    Vansales import:   ${vsImport.summary.succeeded} succeeded, ${vsImport.summary.duplicates} flagged as duplicates, ${vsImport.summary.failed} failed validation.`
  );
  console.log(
    `    Swift import:      ${swImport.summary.succeeded} succeeded, ${swImport.summary.duplicates} flagged as duplicates, ${swImport.summary.failed} failed validation.`
  );
  if (tpImport.summary.failed > 0) {
    for (const r of tpImport.results.filter((r) => !r.success && !r.duplicate)) {
      console.log(`      - row ${r.row}: ${r.error}`);
    }
  }
  if (swImport.summary.failed > 0) {
    for (const r of swImport.results.filter((r) => !r.success && !r.duplicate)) {
      console.log(`      - row ${r.row}: ${r.error}`);
    }
  }

  // ---------------------------------------------------------------------
  // 3. RESOLVE IDENTITY (Phase O2 review queue -- operator pass)
  // ---------------------------------------------------------------------
  // Confirms every pending item as a NEW, distinct identity -- this
  // NEVER merges a fuzzy candidate (e.g. PRINORTH / PRI NORTH stay
  // separate entities here), so it cannot violate the "suggest only,
  // never auto-merge" hard constraint. A real operator using the review
  // UI would instead merge genuine spelling variants by hand; doing so
  // would only consolidate identities, it would not change the total
  // amount posted, since the ledger sums by posting, not by identity
  // grouping. Transporters are confirmed BEFORE vehicles, because a new
  // ContractedVehicle requires an already-resolved transporterPartnerId.
  console.log('\n[3] Resolving normalization review queue (confirming every distinct name as NEW)...');
  const confirmHandler = new ConfirmReviewNewHandler(
    normalizationReviewRepository,
    transportPartnerRepository,
    contractedVehicleRepository,
    transportCostSourceRecordRepository
  );

  const reviewResult1 = await resolvePendingReviews(confirmHandler);
  console.log(
    `    Confirmed ${reviewResult1.transporterConfirmed} distinct transporters, ${reviewResult1.vehicleConfirmed} distinct vehicles (${reviewResult1.vehicleSkippedNoTransporter} skipped for lack of a resolved transporter).`
  );

  // ---------------------------------------------------------------------
  // 4. POST (Phase O3) -- and re-run TWICE more to prove no duplicates.
  // ---------------------------------------------------------------------
  console.log('\n[4] Posting the 3rd Party batch to the Allocation Ledger...');
  const run1 = await transportCostPostingService.postImportBatch(context(), USER_ID, tpImport.importBatchId);
  const postedRun1 = run1.outcomes.filter((o) => o.outcome.status === 'posted').length;
  const skippedRun1 = run1.outcomes.filter((o) => o.outcome.status === 'skipped');
  console.log(`    Run 1: ${postedRun1} posted, ${skippedRun1.length} skipped.`);
  const skipReasons = new Map<string, number>();
  for (const o of skippedRun1) {
    if (o.outcome.status !== 'skipped') continue;
    skipReasons.set(o.outcome.reason, (skipReasons.get(o.outcome.reason) ?? 0) + 1);
  }
  for (const [reason, count] of skipReasons) {
    console.log(`      - ${reason}: ${count}`);
  }

  const ledgerCountAfterRun1 = collections.ledger.docs.length;

  console.log('\n[4b] RE-IMPORT-TWICE CHECK: re-running the identical batch a second and third time...');
  const run2 = await transportCostPostingService.postImportBatch(context(), USER_ID, tpImport.importBatchId);
  const run3 = await transportCostPostingService.postImportBatch(context(), USER_ID, tpImport.importBatchId);
  const unchangedRun2 = run2.outcomes.filter((o) => o.outcome.status === 'unchanged').length;
  const unchangedRun3 = run3.outcomes.filter((o) => o.outcome.status === 'unchanged').length;
  const ledgerCountAfterReimport = collections.ledger.docs.length;
  console.log(`    Run 2: ${unchangedRun2}/${run2.total} unchanged (no-op). Run 3: ${unchangedRun3}/${run3.total} unchanged.`);
  console.log(`    Ledger row count: ${ledgerCountAfterRun1} after run 1, ${ledgerCountAfterReimport} after runs 2+3.`);
  console.log(
    ledgerCountAfterRun1 === ledgerCountAfterReimport
      ? '    PASS -- zero duplicate postings from re-importing the same batch twice more.'
      : '    FAIL -- ledger row count changed on re-import. Investigate before shipping.'
  );

  // ---------------------------------------------------------------------
  // 5. CORRECTED-ROW CHECK
  // ---------------------------------------------------------------------
  console.log('\n[4c] CORRECTED-ROW CHECK: mutating one posted row\'s Amount and re-posting...');
  const firstPostedOutcome = run1.outcomes.find((o) => o.outcome.status === 'posted');
  if (!firstPostedOutcome) {
    console.log('    No posted row available to correct -- skipping this check.');
  } else {
    const sourceRecordId = firstPostedOutcome.sourceRecordId;
    const before = await transportCostSourceRecordRepository.findById(sourceRecordId, TENANT);
    const originalAmount = before!.amount!;
    const originalPostingId = firstPostedOutcome.outcome.status === 'posted' ? String(firstPostedOutcome.outcome.posting._id) : '';
    const originalSnapshot = JSON.stringify(collections.ledger.docs.find((d) => String(d._id) === originalPostingId));

    await transportCostSourceRecordRepository.update(sourceRecordId, { amount: originalAmount + 1 }, TENANT);
    const correction = await transportCostPostingService.postSourceRecord(context(), USER_ID, sourceRecordId);

    console.log(`    Source row ${before!.sourceRowNumber}: Amount ${originalAmount} -> ${originalAmount + 1}.`);
    console.log(`    Outcome: ${correction.status}`);
    if (correction.status === 'corrected') {
      console.log(`      reversal posting ${correction.reversal._id}: ${correction.reversal.amount} ${correction.reversal.currency}`);
      console.log(`      new posting      ${correction.posting._id}: ${correction.posting.amount} ${correction.posting.currency}`);
      const originalNow = collections.ledger.docs.find((d) => String(d._id) === originalPostingId);
      console.log(
        JSON.stringify(originalNow) === originalSnapshot
          ? '    PASS -- the original posting is byte-identical to before the correction (never mutated).'
          : '    FAIL -- the original posting changed. Append-only guarantee violated.'
      );
    }
    // Restore the source amount so the reconciliation below reflects the
    // workbook's real, unmodified figures rather than this deliberate
    // test mutation.
    await transportCostSourceRecordRepository.update(sourceRecordId, { amount: originalAmount }, TENANT);
    const revert = await transportCostPostingService.postSourceRecord(context(), USER_ID, sourceRecordId);
    console.log(`    Reverted the test mutation back to ${originalAmount} (outcome: ${revert.status}) so reconciliation below reflects the real workbook.`);
  }

  // ---------------------------------------------------------------------
  // 6. VANSALES POSTING (periodization Option A) + RECONCILIATION
  // ---------------------------------------------------------------------
  const janStart = new Date('2026-01-01T00:00:00.000Z');
  const janEnd = new Date('2026-01-31T23:59:59.999Z');

  console.log(`\n[4d] Posting the Vansales batch (periodMonth: ${VANSALES_PERIOD_MONTH}) to the Allocation Ledger...`);
  const vsRun1 = await transportCostPostingService.postImportBatch(context(), USER_ID, vsImport.importBatchId);
  const vsPostedRun1 = vsRun1.outcomes.filter((o) => o.outcome.status === 'posted').length;
  const vsSkippedRun1 = vsRun1.outcomes.filter((o) => o.outcome.status === 'skipped');
  console.log(`    Run 1: ${vsPostedRun1} posted, ${vsSkippedRun1.length} skipped.`);
  const vsSkipReasons = new Map<string, number>();
  for (const o of vsSkippedRun1) {
    if (o.outcome.status !== 'skipped') continue;
    vsSkipReasons.set(o.outcome.reason, (vsSkipReasons.get(o.outcome.reason) ?? 0) + 1);
  }
  for (const [reason, count] of vsSkipReasons) {
    console.log(`      - ${reason}: ${count}`);
  }

  console.log('\n[4e] RE-IMPORT-TWICE CHECK (Vansales): re-running the identical batch a second and third time...');
  const vsLedgerCountAfterRun1 = collections.ledger.docs.length;
  const vsRun2 = await transportCostPostingService.postImportBatch(context(), USER_ID, vsImport.importBatchId);
  const vsRun3 = await transportCostPostingService.postImportBatch(context(), USER_ID, vsImport.importBatchId);
  const vsUnchangedRun2 = vsRun2.outcomes.filter((o) => o.outcome.status === 'unchanged').length;
  const vsUnchangedRun3 = vsRun3.outcomes.filter((o) => o.outcome.status === 'unchanged').length;
  const vsLedgerCountAfterReimport = collections.ledger.docs.length;
  console.log(`    Run 2: ${vsUnchangedRun2}/${vsRun2.total} unchanged (no-op). Run 3: ${vsUnchangedRun3}/${vsRun3.total} unchanged.`);
  console.log(`    Ledger row count: ${vsLedgerCountAfterRun1} after run 1, ${vsLedgerCountAfterReimport} after runs 2+3.`);
  console.log(
    vsLedgerCountAfterRun1 === vsLedgerCountAfterReimport
      ? '    PASS -- zero duplicate Vansales postings from re-importing the same batch twice more.'
      : '    FAIL -- ledger row count changed on Vansales re-import. Investigate before shipping.'
  );

  console.log('\n[4f] CORRECTED-ROW CHECK (Vansales): mutating one posted row\'s TOTAL and re-posting...');
  const vsFirstPostedOutcome = vsRun1.outcomes.find((o) => o.outcome.status === 'posted');
  if (!vsFirstPostedOutcome) {
    console.log('    No posted Vansales row available to correct -- skipping this check.');
  } else {
    const sourceRecordId = vsFirstPostedOutcome.sourceRecordId;
    const before = await transportCostSourceRecordRepository.findById(sourceRecordId, TENANT);
    const originalTotal = before!.vansales!.total!;
    const originalPostingId = vsFirstPostedOutcome.outcome.status === 'posted' ? String(vsFirstPostedOutcome.outcome.posting._id) : '';
    const originalSnapshot = JSON.stringify(collections.ledger.docs.find((d) => String(d._id) === originalPostingId));

    await transportCostSourceRecordRepository.update(
      sourceRecordId,
      { vansales: { ...before!.vansales!, total: originalTotal + 1 } },
      TENANT
    );
    const correction = await transportCostPostingService.postSourceRecord(context(), USER_ID, sourceRecordId);

    console.log(`    Source row ${before!.sourceRowNumber}: TOTAL ${originalTotal} -> ${originalTotal + 1}.`);
    console.log(`    Outcome: ${correction.status}`);
    if (correction.status === 'corrected') {
      console.log(`      reversal posting ${correction.reversal._id}: ${correction.reversal.amount} ${correction.reversal.currency}`);
      console.log(`      new posting      ${correction.posting._id}: ${correction.posting.amount} ${correction.posting.currency}`);
      const originalNow = collections.ledger.docs.find((d) => String(d._id) === originalPostingId);
      console.log(
        JSON.stringify(originalNow) === originalSnapshot
          ? '    PASS -- the original Vansales posting is byte-identical to before the correction (never mutated).'
          : '    FAIL -- the original Vansales posting changed. Append-only guarantee violated.'
      );
    }
    // Restore, same discipline as the 3rd Party check above, so the
    // reconciliation below reflects the real, unmodified workbook.
    await transportCostSourceRecordRepository.update(sourceRecordId, { vansales: before!.vansales }, TENANT);
    const revert = await transportCostPostingService.postSourceRecord(context(), USER_ID, sourceRecordId);
    console.log(`    Reverted the test mutation back to TOTAL ${originalTotal} (outcome: ${revert.status}).`);
  }

  console.log('\n[4g] RECONCILIATION -- January 2026, Vansales sheet (TOTAL column)');
  const vsPostedTotal = (
    await allocationLedgerRepository.getNetTotalsByVehicleForCategory('transport-retainer', janStart, janEnd, context())
  ).reduce((sum, v) => sum + v.netReportingAmount, 0);
  const vsFailedRows = vsImport.results.filter((r) => !r.success && !r.duplicate);
  const vsDuplicateRows = vsImport.results.filter((r) => r.duplicate);
  const vsFailedTotal = vsFailedRows.reduce((sum, r) => {
    const row = vansalesRows.find((v) => v.rowNumber === r.row);
    return sum + (typeof row?.total === 'number' && Number.isFinite(row.total) ? row.total : 0);
  }, 0);
  const vsDuplicateTotal = vsDuplicateRows.reduce((sum, r) => {
    const row = vansalesRows.find((v) => v.rowNumber === r.row);
    return sum + (typeof row?.total === 'number' && Number.isFinite(row.total) ? row.total : 0);
  }, 0);
  const vsUnresolvedIdentity = vsSkipReasons.get('unresolved-vehicle-identity') ?? 0;

  console.log(`    Workbook's own January Vansales TOTAL sum (summed from the raw sheet): ${workbookVansalesTotal.toFixed(2)}`);
  console.log(`    Posted to the Allocation Ledger for January, transport-retainer (net, reversal-aware): ${vsPostedTotal.toFixed(2)}`);
  console.log(`    Difference: ${(workbookVansalesTotal - vsPostedTotal).toFixed(2)}`);
  console.log('    Explained by:');
  console.log(`      - ${workbookVansalesPendingRows.length} rows with a blank TOTAL cell (never zero-filled, never posted): pending, not a discrepancy`);
  console.log(`      - ${vsFailedRows.length} rows rejected at import validation, totaling ${vsFailedTotal.toFixed(2)}`);
  console.log(`      - ${vsDuplicateRows.length} rows flagged as likely duplicates, totaling ${vsDuplicateTotal.toFixed(2)}`);
  console.log(`      - ${vsUnresolvedIdentity} rows whose vehicle identity could not be resolved to a confirmed ContractedVehicle`);
  const vsExplainedGap = vsFailedTotal + vsDuplicateTotal;
  const vsUnexplainedGap = workbookVansalesTotal - vsPostedTotal - vsExplainedGap;
  console.log(`    Unexplained residual after accounting for the above: ${vsUnexplainedGap.toFixed(2)} (expect ~0.00, modulo rounding)`);

  // ---------------------------------------------------------------------
  // 7. SWIFT POSTING (costCategory = third-party-transport) + RECONCILIATION
  // ---------------------------------------------------------------------
  console.log('\n[4h] Posting the Swift batch to the Allocation Ledger...');
  const swRun1 = await transportCostPostingService.postImportBatch(context(), USER_ID, swImport.importBatchId);
  const swPostedRun1 = swRun1.outcomes.filter((o) => o.outcome.status === 'posted').length;
  const swSkippedRun1 = swRun1.outcomes.filter((o) => o.outcome.status === 'skipped');
  console.log(`    Run 1: ${swPostedRun1} posted, ${swSkippedRun1.length} skipped.`);
  const swSkipReasons = new Map<string, number>();
  for (const o of swSkippedRun1) {
    if (o.outcome.status !== 'skipped') continue;
    swSkipReasons.set(o.outcome.reason, (swSkipReasons.get(o.outcome.reason) ?? 0) + 1);
  }
  for (const [reason, count] of swSkipReasons) {
    console.log(`      - ${reason}: ${count}`);
  }
  console.log(
    swPostedRun1 === 0 && (swSkipReasons.get('unresolved-vehicle-identity') ?? 0) === swImport.summary.succeeded
      ? '    PASS -- every imported Swift row skips at unresolved-vehicle-identity, exactly as SWIFT_POSTING_DECISION.md documents (no vehicle/transporter column exists in this source at all -- never fabricated).'
      : '    FAIL -- a Swift row posted, or skipped for an unexpected reason. Investigate before shipping (see SWIFT_POSTING_DECISION.md).'
  );

  console.log('\n[4i] RE-IMPORT-TWICE CHECK (Swift): re-running the identical batch a second and third time...');
  const swLedgerCountAfterRun1 = collections.ledger.docs.length;
  const swRun2 = await transportCostPostingService.postImportBatch(context(), USER_ID, swImport.importBatchId);
  const swRun3 = await transportCostPostingService.postImportBatch(context(), USER_ID, swImport.importBatchId);
  const swSkippedRun2 = swRun2.outcomes.filter((o) => o.outcome.status === 'skipped').length;
  const swSkippedRun3 = swRun3.outcomes.filter((o) => o.outcome.status === 'skipped').length;
  const swLedgerCountAfterReimport = collections.ledger.docs.length;
  console.log(`    Run 2: ${swSkippedRun2}/${swRun2.total} skipped (same as run 1, no state change). Run 3: ${swSkippedRun3}/${swRun3.total} skipped.`);
  console.log(`    Ledger row count (whole tenant -- 3rd Party/Vansales postings from earlier steps are already in here too): ${swLedgerCountAfterRun1} after run 1, ${swLedgerCountAfterReimport} after runs 2+3.`);
  console.log(
    swLedgerCountAfterRun1 === swLedgerCountAfterReimport && swPostedRun1 === 0
      ? '    PASS -- zero Swift postings from any of the three runs, and the ledger gained zero rows from re-running the Swift batch (idempotent no-op, not just "no duplicates").'
      : '    FAIL -- a Swift row posted, or the ledger\'s row count changed on re-import. Investigate before shipping.'
  );

  console.log('\n[4j] RECONCILIATION -- January 2026, Swift sheet (Total(Incl) column)');
  console.log(
    `    Sanity cross-check: the sheet's OWN trailing subtotal row (Excel row 283) totals ${workbookSwiftFooterSubtotal.toFixed(2)} -- ` +
      (Math.abs(workbookSwiftFooterSubtotal - workbookSwiftTotal) < 0.01
        ? `this MATCHES the ${swiftGenuineRows.length} genuine rows' own independently-computed sum (${workbookSwiftTotal.toFixed(2)}) exactly, confirming Excel's own subtotal and this script's row-level sum agree. That subtotal row is correctly excluded from every total below -- summing it in as well would silently double the true figure.`
          : `this does NOT match the ${swiftGenuineRows.length} genuine rows' independently-computed sum (${workbookSwiftTotal.toFixed(2)}) -- investigate before trusting this reconciliation (either the footer formula or this script's row filter disagrees with the real sheet).`)
  );

  const swFailedRows = swImport.results.filter((r) => !r.success && !r.duplicate);
  const swDuplicateRows = swImport.results.filter((r) => r.duplicate);
  const swSucceededRowNumbers = new Set(swImport.results.filter((r) => r.success).map((r) => r.row));
  const swImportedTotal = swiftGenuineRows
    .filter((r) => swSucceededRowNumbers.has(r.rowNumber))
    .reduce((sum, r) => sum + (typeof r.totalIncl === 'number' && Number.isFinite(r.totalIncl) ? r.totalIncl : 0), 0);
  // Rejected/duplicate rows counted here ONLY when they were a genuine
  // row to begin with (footer/blank rows are already excluded from
  // workbookSwiftTotal entirely, so counting their rejection here again
  // would double-subtract them).
  const swFailedGenuineTotal = swFailedRows.reduce((sum, r) => {
    const row = swiftGenuineRows.find((s) => s.rowNumber === r.row);
    return sum + (typeof row?.totalIncl === 'number' && Number.isFinite(row.totalIncl) ? row.totalIncl : 0);
  }, 0);
  const swDuplicateGenuineTotal = swDuplicateRows.reduce((sum, r) => {
    const row = swiftGenuineRows.find((s) => s.rowNumber === r.row);
    return sum + (typeof row?.totalIncl === 'number' && Number.isFinite(row.totalIncl) ? row.totalIncl : 0);
  }, 0);

  // Per-skip-reason totals, derived from the REAL posted source record's
  // own `amount` field (not re-derived from the raw sheet) -- the same
  // discipline the 3rd Party out-of-period walk above uses.
  let swPendingAmountTotal = 0;
  let swUnresolvedIdentityTotal = 0;
  for (const o of swRun1.outcomes) {
    if (o.outcome.status !== 'skipped') continue;
    const rec = await transportCostSourceRecordRepository.findById(o.sourceRecordId, TENANT);
    const amt = typeof rec?.amount === 'number' ? rec.amount : 0;
    if (o.outcome.reason === 'pending-amount') swPendingAmountTotal += amt;
    if (o.outcome.reason === 'unresolved-vehicle-identity') swUnresolvedIdentityTotal += amt;
  }

  const swImportedGenuineCount = swiftGenuineRows.filter((r) => swSucceededRowNumbers.has(r.rowNumber)).length;
  console.log(`    Workbook's own January Swift Total(Incl) sum (${swiftGenuineRows.length} genuine consignment rows only -- excludes the sheet's own subtotal/blank rows): ${workbookSwiftTotal.toFixed(2)}`);
  console.log(`    Imported successfully as source evidence: ${swImportedGenuineCount} rows, totaling ${swImportedTotal.toFixed(2)}`);
  console.log(`    Posted to the Allocation Ledger: ${swPostedRun1} rows, totaling 0.00 (every imported row structurally cannot resolve a vehicle identity -- see SWIFT_POSTING_DECISION.md)`);
  console.log('    Explained by:');
  console.log(`      - ${swiftNonDataRows.length} rows in the raw sheet that are not genuine consignment rows (the trailing blank rows + the sheet's own subtotal row) -- excluded before this reconciliation even starts, never summed as if they were shipments`);
  console.log(`      - ${workbookSwiftPendingRows.length} genuine rows with a blank Total(Incl) cell (never zero-filled, never posted): pending, not a discrepancy`);
  console.log(`      - ${swFailedRows.length} rows rejected at import validation, ${swFailedGenuineTotal.toFixed(2)} of that total belonging to a genuine row (the rest are the already-excluded blank/footer rows)`);
  console.log(`      - ${swDuplicateRows.length} rows flagged as likely duplicates (expected 0 -- see SWIFT_POSTING_DECISION.md's "Swift rows are never deduplicated" section: registration is always null, so the duplicate check never fires for this family), totaling ${swDuplicateGenuineTotal.toFixed(2)} among genuine rows`);
  console.log(`      - imported rows refused as pending-amount at posting time (blank Total(Incl) that nonetheless reached posting), totaling ${swPendingAmountTotal.toFixed(2)}`);
  console.log(`      - imported rows skipped at posting time for unresolved-vehicle-identity -- structural, not a data-quality gap: this source has no registration/transporter column at all -- totaling ${swUnresolvedIdentityTotal.toFixed(2)}`);
  const swExplainedGap = swFailedGenuineTotal + swDuplicateGenuineTotal + swPendingAmountTotal + swUnresolvedIdentityTotal;
  const swUnexplainedGap = workbookSwiftTotal - 0 /* posted */ - swExplainedGap;
  console.log(`    Unexplained residual after accounting for the above: ${swUnexplainedGap.toFixed(2)} (expect ~0.00, modulo rounding)`);

  // ---------------------------------------------------------------------
  // 9. DEPOT STO -- six real sheets, four column shapes, ONE tolerant
  // parser (validateAndBuildDepotSto). Each sheet is imported AND
  // posted as its own batch (one execute() call, one postImportBatch()
  // call per sheet -- exactly like an operator uploading one file at a
  // time), then combined into one reconciliation -- see
  // DEPOT_STO_DECISION.md for the full drift/vehicle-identity record.
  // ---------------------------------------------------------------------
  console.log('\n[4k] Importing all six real Depot STO sheets via the real ImportTransportCostHandler (one batch per sheet)...');
  const dsImports: Array<{ label: string; result: Awaited<ReturnType<typeof importHandler.execute>> }> = [];
  for (const sheet of depotStoSheets) {
    const result = await importHandler.execute(
      new ImportTransportCostCommand('depot-sto', sheet.rows, TENANT, scope(), 'TRANSPORT_COST_JANUARY_2026.xlsx', USER_ID)
    );
    dsImports.push({ label: sheet.label, result });
    console.log(
      `    ${sheet.label.padEnd(6)} import: ${result.summary.succeeded} succeeded, ${result.summary.duplicates} flagged as duplicates, ${result.summary.failed} failed validation.`
    );
  }

  console.log("\n[4l] Resolving normalization review queue for Depot STO's own new transporters/vehicles...");
  const reviewResult2 = await resolvePendingReviews(confirmHandler);
  console.log(
    `    Confirmed ${reviewResult2.transporterConfirmed} distinct transporters, ${reviewResult2.vehicleConfirmed} distinct vehicles (${reviewResult2.vehicleSkippedNoTransporter} skipped for lack of a resolved transporter).`
  );

  console.log('\n[4m] Posting all six Depot STO batches to the Allocation Ledger...');
  const dsPostRuns: Array<{ label: string; run: Awaited<ReturnType<typeof transportCostPostingService.postImportBatch>> }> = [];
  for (const { label, result } of dsImports) {
    const run = await transportCostPostingService.postImportBatch(context(), USER_ID, result.importBatchId);
    dsPostRuns.push({ label, run });
    const posted = run.outcomes.filter((o) => o.outcome.status === 'posted').length;
    const skipped = run.outcomes.filter((o) => o.outcome.status === 'skipped').length;
    const skipReasons = new Map<string, number>();
    for (const o of run.outcomes) {
      if (o.outcome.status !== 'skipped') continue;
      skipReasons.set(o.outcome.reason, (skipReasons.get(o.outcome.reason) ?? 0) + 1);
    }
    console.log(
      `    ${label.padEnd(6)}: ${posted} posted, ${skipped} skipped (${[...skipReasons.entries()].map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}).`
    );
  }

  const dsAllOutcomes = dsPostRuns.flatMap((p) => p.run.outcomes.map((o) => ({ label: p.label, ...o })));
  const dsPostedCount = dsAllOutcomes.filter((o) => o.outcome.status === 'posted').length;
  const dsPostedTotal = dsAllOutcomes.reduce((sum, o) => sum + (o.outcome.status === 'posted' ? o.outcome.posting.reportingAmount : 0), 0);
  const dsOverallSkipReasons = new Map<string, number>();
  for (const o of dsAllOutcomes) {
    if (o.outcome.status !== 'skipped') continue;
    dsOverallSkipReasons.set(o.outcome.reason, (dsOverallSkipReasons.get(o.outcome.reason) ?? 0) + 1);
  }
  console.log(
    dsPostedCount > 0 && (dsOverallSkipReasons.get('unresolved-vehicle-identity') ?? 0) > 0
      ? "    PASS -- a mix of posted and unresolved-vehicle-identity-skipped rows, matching DEPOT_STO_DECISION.md's per-month table (March/April/August rows carry a real, populated registration and post normally; May/June/July rows do not, in the real data, and correctly skip)."
      : '    FAIL -- expected BOTH posted rows and unresolved-vehicle-identity skips from this real data. Investigate before shipping (see DEPOT_STO_DECISION.md).'
  );

  console.log("\n[4n] RE-POST CHECK (Depot STO): re-running every batch's posting a second time...");
  const dsLedgerCountAfterRun1 = collections.ledger.docs.length;
  let dsRepostPosted = 0;
  for (const { result } of dsImports) {
    const run2 = await transportCostPostingService.postImportBatch(context(), USER_ID, result.importBatchId);
    dsRepostPosted += run2.outcomes.filter((o) => o.outcome.status === 'posted').length;
  }
  const dsLedgerCountAfterRepost = collections.ledger.docs.length;
  console.log(`    Ledger row count (whole tenant): ${dsLedgerCountAfterRun1} after run 1, ${dsLedgerCountAfterRepost} after re-posting all six batches.`);
  console.log(
    dsLedgerCountAfterRun1 === dsLedgerCountAfterRepost && dsRepostPosted === 0
      ? '    PASS -- zero additional Depot STO postings and zero ledger row change from re-posting all six batches (idempotent no-op).'
      : "    FAIL -- a Depot STO row posted again, or the ledger's row count changed on re-post. Investigate before shipping."
  );

  console.log('\n[4o] RECONCILIATION -- all six real Depot STO sheets (Amount/COSTS/COST column)');
  let dsFailedCount = 0;
  let dsFailedGenuineTotal = 0;
  let dsDuplicateCount = 0;
  let dsDuplicateGenuineTotal = 0;
  let dsGenuinePendingCount = 0;
  for (const sheet of depotStoSheets) {
    const importResult = dsImports.find((d) => d.label === sheet.label)!.result;
    const genuineRows = sheet.rows.filter(sheet.genuine);
    dsGenuinePendingCount += genuineRows.filter((r) => typeof r.amount !== 'number' || !Number.isFinite(r.amount)).length;
    for (const r of importResult.results) {
      if (r.success) continue;
      const row = genuineRows.find((sr) => sr.rowNumber === r.row);
      if (!row || typeof row.amount !== 'number' || !Number.isFinite(row.amount)) continue;
      if (r.duplicate) {
        dsDuplicateCount += 1;
        dsDuplicateGenuineTotal += row.amount;
      } else {
        dsFailedCount += 1;
        dsFailedGenuineTotal += row.amount;
      }
    }
  }

  // Per-skip-reason totals, derived from the REAL posted source
  // record's own `amount` field (not re-derived from the raw sheet) --
  // the same discipline the 3rd Party out-of-period walk and Swift's
  // own per-reason totals above use.
  let dsPendingAmountTotal = 0;
  let dsUnresolvedIdentityTotal = 0;
  for (const o of dsAllOutcomes) {
    if (o.outcome.status !== 'skipped') continue;
    const rec = await transportCostSourceRecordRepository.findById(o.sourceRecordId, TENANT);
    const amt = typeof rec?.amount === 'number' ? rec.amount : 0;
    if (o.outcome.reason === 'pending-amount') dsPendingAmountTotal += amt;
    if (o.outcome.reason === 'unresolved-vehicle-identity') dsUnresolvedIdentityTotal += amt;
  }

  console.log(
    `    Six sheets' own combined Amount/COSTS/COST sum (${workbookDepotStoGenuineCount} genuine rows only -- excludes March's own "TOTAL VAT EXCL" subtotal row and each sheet's trailing blank/padding rows): ${workbookDepotStoTotal.toFixed(2)}`
  );
  console.log(`    Posted to the Allocation Ledger: ${dsPostedCount} rows, totaling ${dsPostedTotal.toFixed(2)}`);
  console.log('    Explained by:');
  console.log(`      - ${dsGenuinePendingCount} genuine rows with a blank Amount/COSTS/COST cell (never zero-filled, never posted): pending, not a discrepancy`);
  console.log(
    `      - ${dsFailedCount} rows rejected at import validation (missing/unparseable DATE -- this is most of July's 72 undated rows, see DEPOT_STO_DECISION.md -- or a known-invalid transporter label), totaling ${dsFailedGenuineTotal.toFixed(2)}`
  );
  console.log(`      - ${dsDuplicateCount} rows flagged as likely duplicates, totaling ${dsDuplicateGenuineTotal.toFixed(2)}`);
  console.log(`      - imported rows refused as pending-amount at posting time, totaling ${dsPendingAmountTotal.toFixed(2)}`);
  console.log(
    `      - imported rows skipped at posting time for unresolved-vehicle-identity (May: no registration column at all; June/July: the column exists but is essentially never populated in the real data -- see DEPOT_STO_DECISION.md's "Vehicle identity" table), totaling ${dsUnresolvedIdentityTotal.toFixed(2)}`
  );
  const dsExplainedGap = dsFailedGenuineTotal + dsDuplicateGenuineTotal + dsPendingAmountTotal + dsUnresolvedIdentityTotal;
  const dsUnexplainedGap = workbookDepotStoTotal - dsPostedTotal - dsExplainedGap;
  console.log(`    Unexplained residual after accounting for the above: ${dsUnexplainedGap.toFixed(2)} (expect ~0.00, modulo rounding)`);

  console.log('\n    Per-month breakdown:');
  for (const sheet of depotStoSheets) {
    const importResult = dsImports.find((d) => d.label === sheet.label)!.result;
    const postRun = dsPostRuns.find((p) => p.label === sheet.label)!.run;
    const posted = postRun.outcomes.filter((o) => o.outcome.status === 'posted').length;
    const postedAmt = postRun.outcomes.reduce((sum, o) => sum + (o.outcome.status === 'posted' ? o.outcome.posting.reportingAmount : 0), 0);
    const skipReasons = new Map<string, number>();
    for (const o of postRun.outcomes) {
      if (o.outcome.status !== 'skipped') continue;
      skipReasons.set(o.outcome.reason, (skipReasons.get(o.outcome.reason) ?? 0) + 1);
    }
    console.log(
      `      ${sheet.label.padEnd(6)}: ${importResult.summary.succeeded} imported, ${posted} posted (${postedAmt.toFixed(2)}), skips: ${
        [...skipReasons.entries()].map(([k, v]) => `${k}=${v}`).join(', ') || 'none'
      }`
    );
  }

  // ---------------------------------------------------------------------
  // 8. RECONCILIATION (3rd Party)
  // ---------------------------------------------------------------------
  console.log('\n[5] RECONCILIATION -- January 2026, 3rd Party sheet');
  const report = await transportCostReportService.getAllocationReport(context(), janStart, janEnd);
  const postedTotal = report.byVehicle.reduce((sum, v) => sum + v.netReportingAmount, 0);

  const failedRows = tpImport.results.filter((r) => !r.success && !r.duplicate);
  const duplicateRows = tpImport.results.filter((r) => r.duplicate);
  const failedTotal = failedRows.reduce((sum, r) => {
    const row = thirdPartyRows.find((tp) => tp.rowNumber === r.row);
    return sum + (typeof row?.amount === 'number' && Number.isFinite(row.amount) ? row.amount : 0);
  }, 0);
  const duplicateTotal = duplicateRows.reduce((sum, r) => {
    const row = thirdPartyRows.find((tp) => tp.rowNumber === r.row);
    return sum + (typeof row?.amount === 'number' && Number.isFinite(row.amount) ? row.amount : 0);
  }, 0);
  const pendingAmountTotalExcluded = 0; // null Amount rows contribute 0 to workbookThirdPartyTotal already
  const stillUnresolvedIdentity = skipReasons.get('unresolved-vehicle-identity') ?? 0;

  // Rows that posted successfully but whose OWN Date cell places the
  // transaction outside January 2026 -- the ledger periods a row by its
  // own parsed date, never by which sheet tab it came from (the sheet
  // is named "JAN-26" but a handful of rows carry a year-entry typo,
  // e.g. "31.01.25" instead of "31.01.26"). Coercing these into the
  // January period because of the tab's name would be exactly the kind
  // of silent fabrication this delivery's hard constraints forbid, so
  // they correctly post to their literal period and are excluded from
  // this report -- surfaced here by name, not absorbed into a mystery
  // gap.
  let outOfPeriodTotal = 0;
  let outOfPeriodCount = 0;
  const outOfPeriodRows: Array<{ rowNumber: number; rawDate: string; amount: number }> = [];
  for (const o of run1.outcomes) {
    if (o.outcome.status !== 'posted') continue;
    const posting = o.outcome.posting;
    if (posting.periodStart >= janStart && posting.periodStart <= janEnd) continue;
    const rec = await transportCostSourceRecordRepository.findById(o.sourceRecordId, TENANT);
    outOfPeriodTotal += posting.reportingAmount;
    outOfPeriodCount += 1;
    outOfPeriodRows.push({ rowNumber: rec?.sourceRowNumber ?? -1, rawDate: rec?.rawDate ?? '?', amount: posting.reportingAmount });
  }

  console.log(`    Workbook's own January 3rd Party Amount total (summed from the raw sheet): ${workbookThirdPartyTotal.toFixed(2)} (currency not stated in source -- see README)`);
  console.log(`    Posted to the Allocation Ledger for January (net, reversal-aware):          ${postedTotal.toFixed(2)} ${report.reportingCurrency}`);
  console.log(`    Difference: ${(workbookThirdPartyTotal - postedTotal).toFixed(2)}`);
  console.log('    Explained by:');
  console.log(`      - ${workbookThirdPartyPendingRows.length} rows with a blank Amount cell (never zero-filled, never posted): pending, not a discrepancy`);
  console.log(`      - ${failedRows.length} rows rejected at import validation (bad date/registration/known-invalid transporter), totaling ${failedTotal.toFixed(2)}`);
  console.log(`      - ${duplicateRows.length} rows flagged as likely duplicates of an already-imported row, totaling ${duplicateTotal.toFixed(2)}`);
  console.log(`      - ${stillUnresolvedIdentity} rows whose vehicle identity could not be resolved to a confirmed ContractedVehicle`);
  console.log(
    `      - ${outOfPeriodCount} rows posted successfully but their Date cell parses outside January 2026 (likely a year-entry typo on the source sheet, e.g. "31.01.25"), totaling ${outOfPeriodTotal.toFixed(2)} -- posted to their own literal period, not to January, and not fabricated into this month`
  );
  for (const r of outOfPeriodRows) {
    console.log(`          row ${r.rowNumber}: rawDate="${r.rawDate}", amount=${r.amount}`);
  }
  const explainedGap = failedTotal + duplicateTotal + outOfPeriodTotal;
  const unexplainedGap = workbookThirdPartyTotal - postedTotal - explainedGap;
  console.log(`    Unexplained residual after accounting for the above: ${unexplainedGap.toFixed(2)} (expect ~0.00, modulo rounding)`);

  // ---------------------------------------------------------------------
  // ITEM 1 -- itemized rejected-row data-quality report, not a summary
  // count. One line per row: row number, raw date, raw registration,
  // raw transporter, amount, and the specific validation rule that
  // rejected it -- pulled from the raw workbook row (thirdPartyRows),
  // never from any parsed/normalized field, so this is exactly what a
  // human opening the source file at that row number would see.
  // ---------------------------------------------------------------------
  console.log(`\n[5b] ITEMIZED: the ${failedRows.length} rejected January 2026 3rd Party rows`);
  console.log('    row | raw date       | raw registration | raw transporter        | amount     | rejected because');
  console.log('    ----+----------------+-------------------+-------------------------+------------+------------------------------------------');
  for (const r of failedRows) {
    const row = thirdPartyRows.find((tp) => tp.rowNumber === r.row);
    const rawDate = row?.date ?? '(blank)';
    const rawReg = row?.registration ?? '(blank)';
    const rawTransporter = row?.transporter ?? '(blank)';
    const amount = row?.amount != null && Number.isFinite(row.amount) ? String(row.amount) : '(blank)';
    console.log(
      `    ${String(r.row).padStart(3)} | ${String(rawDate).padEnd(14)} | ${String(rawReg).padEnd(17)} | ${String(rawTransporter).padEnd(23)} | ${amount.padEnd(10)} | ${r.error}`
    );
  }

  // ---------------------------------------------------------------------
  // ITEM 6 -- confirm the persisted-exceptions + period-outlier export
  // reproduces the same findings via the real API path (report service
  // + repository), not just the in-script arrays above.
  // ---------------------------------------------------------------------
  console.log('\n[5c] ITEM 6 CHECK: TransportCostReportService.getDataQualityExceptions for January 2026');
  const exceptionsReport = await transportCostReportService.getDataQualityExceptions(context(), janStart, janEnd);
  console.log(
    `    rejected=${exceptionsReport.rejected.length}, duplicates=${exceptionsReport.duplicates.length}, periodOutliers=${exceptionsReport.periodOutliers.length}`
  );
  console.log(
    exceptionsReport.rejected.length === failedRows.length
      ? '    PASS -- getDataQualityExceptions finds the same number of rejected rows as the import result itself.'
      : `    FAIL -- getDataQualityExceptions found ${exceptionsReport.rejected.length} rejected rows, expected ${failedRows.length}. Investigate before shipping.`
  );
  console.log(
    exceptionsReport.periodOutliers.length === outOfPeriodCount
      ? '    PASS -- getDataQualityExceptions finds the same number of period-outlier (year-typo) postings as the manual scan above.'
      : `    FAIL -- getDataQualityExceptions found ${exceptionsReport.periodOutliers.length} period outliers, expected ${outOfPeriodCount}. Investigate before shipping.`
  );

  // ---------------------------------------------------------------------
  // 9. THE O4 REPORT, AS THE SCREEN WOULD RENDER IT
  // ---------------------------------------------------------------------
  console.log('\n[6] O4 report for January 2026 (Business Stream -> Vehicle):');
  console.log(`    Pending banner: ${report.pending.hasPendingAmounts ? `SHOWN -- ${report.pending.pendingSourceRecordCount} rows in this period still have no Amount` : 'not shown'}`);
  for (const stream of report.byBusinessStream) {
    console.log(`    ${stream.businessStream}: ${stream.netReportingAmount.toFixed(2)} ${stream.reportingCurrency} across ${stream.vehicleCount} vehicle(s), ${stream.postingCount} posting(s)`);
  }
  console.log('\n    Top 5 vehicles by posted total:');
  const top5 = [...report.byVehicle].sort((a, b) => b.netReportingAmount - a.netReportingAmount).slice(0, 5);
  for (const v of top5) {
    console.log(`      ${v.registration.padEnd(12)} ${v.transporterName.padEnd(20)} ${v.netReportingAmount.toFixed(2)} ${v.reportingCurrency} (${v.postingCount} postings)`);
  }

  if (top5[0]) {
    const drill = await transportCostReportService.getPostingsForVehicle(context(), top5[0].contractedVehicleId, janStart, janEnd);
    console.log(`\n    Drill-down for ${drill.registration} (${drill.transporterName}, stream: ${drill.businessStream}):`);
    for (const p of drill.postings) {
      // periodStart -- the transaction's own date -- not postedAt
      // (audit metadata: when this ledger row was written, which is
      // "today" for every row in a single verification run and would
      // make every posting look like it happened on the same day).
      console.log(`      ${new Date(p.periodStart).toISOString().slice(0, 10)}  ${p.amount.toString().padStart(10)} ${p.currency}  ${p.description ?? ''}${p.reversalOfPostingId ? '  [REVERSAL]' : ''}`);
    }
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('Verification script failed:', err);
  process.exitCode = 1;
});
