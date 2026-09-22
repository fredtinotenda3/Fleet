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
//   1. Import the real January 2026 "JAN-26 3rd Party" and
//      "JAN-26 Vansales" sheets through the real O1 handler.
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
//   7. Run the real TransportCostReportService.getAllocationReport for
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
import { ImportTransportCostCommand, ThirdPartyImportRow, VansalesImportRow } from '../modules/transport-cost/commands/import-transport-cost.command';
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
const workbook = XLSX.readFile(xlsxPath);

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

console.log(`    3rd Party: ${thirdPartyRows.length} data rows. Vansales: ${vansalesRows.length} data rows.`);

// The workbook's OWN January 3rd Party Amount total -- the reconciliation target.
const workbookThirdPartyTotal = thirdPartyRows.reduce((sum, r) => sum + (typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : 0), 0);
const workbookThirdPartyPendingRows = thirdPartyRows.filter((r) => r.amount === undefined || r.amount === null || Number.isNaN(r.amount));

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
    new ImportTransportCostCommand('vansales', vansalesRows, TENANT, scope(), 'TRANSPORT_COST_JANUARY_2026.xlsx', USER_ID)
  );

  console.log(
    `    3rd Party import: ${tpImport.summary.succeeded} succeeded, ${tpImport.summary.duplicates} flagged as duplicates, ${tpImport.summary.failed} failed validation.`
  );
  console.log(
    `    Vansales import:   ${vsImport.summary.succeeded} succeeded, ${vsImport.summary.duplicates} flagged as duplicates, ${vsImport.summary.failed} failed validation.`
  );
  if (tpImport.summary.failed > 0) {
    for (const r of tpImport.results.filter((r) => !r.success && !r.duplicate)) {
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

  console.log(`    Confirmed ${transporterConfirmed} distinct transporters, ${vehicleConfirmed} distinct vehicles (${vehicleSkippedNoTransporter} skipped for lack of a resolved transporter).`);

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
  // 6. RECONCILIATION
  // ---------------------------------------------------------------------
  console.log('\n[5] RECONCILIATION -- January 2026, 3rd Party sheet');
  const janStart = new Date('2026-01-01T00:00:00.000Z');
  const janEnd = new Date('2026-01-31T23:59:59.999Z');
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
  // 7. THE O4 REPORT, AS THE SCREEN WOULD RENDER IT
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
