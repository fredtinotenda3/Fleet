// modules/transport-cost/commands/handlers/import-transport-cost.handler.ts
//
// Phase O1 of the Olivine transport-cost work (audit Section S). This
// handler is deliberately narrow:
//
//   - It imports SOURCE EVIDENCE ONLY. Nothing here posts to the
//     Allocation Ledger, computes cost-per-km/cost-per-tonne, or feeds
//     any report. Those are Phases O3/O4, gated on Section R's client
//     confirmations (tonnage units, currency/VAT basis, business-stream
//     identity).
//   - It never coerces a blank Amount cell to 0. The audit's Section K
//     finding is that a blank Amount is common and GROWING over the
//     period covered (25.5% null in January, 94.1% by July) and almost
//     certainly means "not invoiced yet", not "zero cost". Treating it
//     as 0 would understate every recent-month total and violate this
//     codebase's own data-truth convention (tests/security/
//     fabricated-metrics.spec.ts, honest-metrics.spec.ts).
//   - It never fuzzy-matches transporter names. The audit's Section K
//     found dozens of spelling variants for the same transporter --
//     that normalization is Phase O2, gated on a confirmed master list,
//     specifically so a false merge is never made silently.
//   - It never trusts the uploaded row for tenancy fields. orgUnitId
//     comes from the importing user's own scope (resolveCreationOrgUnitId),
//     exactly like the Dispatch and Inventory modules' 'explicit'
//     org-unit source -- there is no vehicle to inherit from, because
//     these registrations belong to third-party transporters, not
//     Olivine-owned vehicles in tblvehicles (audit Section F).
//   - Duplicate detection is a SOFT, FLAGGED match (same sheetFamily +
//     registration + calendar date + amount), mirroring
//     ImportTripsHandler's own duplicate guard. It is deliberately not
//     used to silently merge or silently drop -- see the audit's
//     Section I duplicate-record-risk discussion.
//   - A Vansales import requires `command.periodMonth` ("YYYY-MM"),
//     validated for the WHOLE BATCH before any row is inserted (see
//     execute() below) and stamped onto every row's `vansales.periodMonth`
//     -- Vansales periodization Option A, VANSALES_PERIODIZATION_DECISION.md.
//     Never inferred from a sheet-tab name or any other free text.
//   - A Swift row requires only "Cons. date" (parseable) and "Cons.
//     Number" (non-blank) -- ONE tolerant parser over that small
//     required-column subset, not a parser per month, so an optional
//     column being missing or reordered in a later month's sheet does
//     not break import. Swift's source data has no registration/
//     transporter column at all (verified against the real workbook),
//     so a Swift row's registration/transporterNormalized are always
//     null -- never fabricated -- which means it can never resolve a
//     contractedVehicleId at posting time either; see
//     TransportCostPostingService's header for why that is structural,
//     not a bug.
//   - A Depot STO row requires only `date` (parseable) -- ONE tolerant
//     parser over the UNION of every column seen across six real
//     months' worth of genuinely different sheet layouts (see
//     DEPOT_STO_DECISION.md). Unlike Swift, registration MAY be
//     present, but whether it actually is depends on the real data,
//     not just on which months' schema includes a registration-shaped
//     column: March/April/August rows carry a real, populated
//     registration in practice (100%/100%/98.8% of real rows); May's
//     sheet has no registration column at all; June/July's sheets DO
//     have a `REG` column but it's populated in essentially none of
//     the real rows (0/24, 1/84) -- see DEPOT_STO_DECISION.md's
//     "Vehicle identity" table. Whichever the reason, an unresolved
//     row always maps registration to null, honestly, never
//     fabricated -- the same non-fabrication discipline as every
//     other family. The three sign-off columns ("Mr Gurjit", "Mr
//     Inderjeet", "Sharma Ji") and TOONNES are stored as raw provenance
//     only -- see DepotStoSourceFields' doc comment for why their
//     meaning is never interpreted here. May's sheet also has five
//     named per-product quantity columns that can all be populated on
//     one row simultaneously -- preserved in their own
//     `mayProductQuantities` object (keyed by literal header text),
//     never folded into one field the way Amount/COSTS/COST are, since
//     doing so would lose real data rather than just rename it.

import { ICommandHandler } from '@/server/cqrs/command';
import {
  ImportTransportCostCommand,
  ThirdPartyImportRow,
  VansalesImportRow,
  SwiftImportRow,
  DepotStoImportRow,
} from '../import-transport-cost.command';
import { TransportCostSourceRecordRepository } from '@/modules/transport-cost/repositories/transport-cost-source-record.repository';
import {
  TransportCostImportExceptionRepository,
  transportCostImportExceptionRepository,
} from '@/modules/transport-cost/repositories/transport-cost-import-exception.repository';
import { TransportCostSourceRecord } from '@/shared/types/transport-cost.types';
import { TransportCostImportExceptionKind } from '@/shared/types/transport-cost-import-exception.types';
import { resolveCreationOrgUnitId } from '@/server/utils/tenant-context.utils';
import { ForbiddenError, ValidationError } from '@/server/errors/app.errors';
import { randomUUID } from 'crypto';
import {
  parseSourceDate,
  parseAmount,
  normalizeRegistration,
  normalizeTransporter,
  isKnownInvalidTransporter,
  parsePeriodMonth,
} from '@/modules/transport-cost/utils/normalization.utils';
import {
  NormalizationMatcherService,
  normalizationMatcherService,
} from '@/modules/transport-cost/services/normalization-matcher.service';

export interface ImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  column?: string;
  invalidValue?: string;
  error?: string;
  suggestedFix?: string;
  /** True when the row was recognised as a likely re-import of an
   *  existing record (see the repository's findLikelyDuplicate) and
   *  therefore not inserted. Kept distinct from a validation failure so
   *  the importer can tell "this is bad data" from "this looks like a
   *  file you already imported" -- same distinction FuelImportModal's
   *  UI already makes. */
  duplicate?: boolean;
}

export interface ImportSummary {
  total: number;
  succeeded: number;
  duplicates: number;
  failed: number;
}

export interface ImportTransportCostResult {
  importBatchId: string;
  summary: ImportSummary;
  results: ImportRowResult[];
}

// NOTE: parseSourceDate, parseAmount, normalizeRegistration,
// normalizeTransporter, isKnownInvalidTransporter, and
// KNOWN_INVALID_TRANSPORTER_VALUES used to be declared here (Phase O1).
// They moved to modules/transport-cost/utils/normalization.utils.ts,
// unchanged, in Phase O2 so the O2 normalization matcher can import the
// exact same functions instead of a re-implementation that could drift
// -- see that file's header. This handler now imports them from there.

export class ImportTransportCostHandler
  implements ICommandHandler<ImportTransportCostCommand, ImportTransportCostResult>
{
  constructor(
    private readonly repo: TransportCostSourceRecordRepository,
    // Phase O2: defaults to the process-wide singleton so every real
    // call site (cqrs.register.ts) needs no change; injectable here so
    // unit tests can mock it without reaching into the module system.
    private readonly matcher: NormalizationMatcherService = normalizationMatcherService,
    // Item 6 (data-quality exceptions export): same defaulting
    // convention as `matcher` immediately above, for the same reason --
    // every existing call site (cqrs.register.ts, the verify script,
    // every two-arg test construction) keeps compiling unchanged.
    private readonly exceptionRepo: TransportCostImportExceptionRepository = transportCostImportExceptionRepository
  ) {}

  async execute(command: ImportTransportCostCommand): Promise<ImportTransportCostResult> {
    // Vansales periodization Option A (VANSALES_PERIODIZATION_DECISION.md):
    // periodMonth is validated for the WHOLE BATCH before any row is
    // inserted, not per row -- a Vansales import always covers one
    // declared month, and rejecting the batch up front (rather than
    // silently accepting rows TransportCostPostingService will later
    // skip with 'missing-period-month') gives the importer an immediate,
    // actionable error instead of a delayed, confusing one.
    if (command.sheetFamily === 'vansales' && !parsePeriodMonth(command.periodMonth)) {
      throw new ValidationError(
        `A Vansales import requires periodMonth as "YYYY-MM" (the calendar month this batch's ` +
          `retainer rows cover) -- got ${command.periodMonth === undefined ? 'nothing' : JSON.stringify(command.periodMonth)}. ` +
          'See VANSALES_PERIODIZATION_DECISION.md.'
      );
    }

    const importBatchId = randomUUID();
    const results: ImportRowResult[] = [];

    // Org-unit resolution happens ONCE, for the whole batch, not per
    // row -- every row in one import shares the same submitter, and
    // there is no vehicle for any individual row to inherit scope from
    // (audit Section F/K: these are third-party/contracted vehicles,
    // not rows in tblvehicles). A system-scoped import (no acting user
    // -- e.g. a future scheduled backfill) leaves orgUnitId unresolved
    // for every row, to be backfilled once that path exists, rather
    // than guessing.
    let orgUnitId: string | undefined;
    if (command.scope.kind === 'user') {
      try {
        orgUnitId = resolveCreationOrgUnitId(command.scope.context, undefined);
      } catch (err) {
        if (err instanceof ForbiddenError) throw err;
        throw err;
      }
    }

    for (const row of command.rows) {
      const rowNum = row.rowNumber;

      const result =
        command.sheetFamily === 'third-party'
          ? this.validateAndBuildThirdParty(row as ThirdPartyImportRow, rowNum)
          : command.sheetFamily === 'swift'
          ? this.validateAndBuildSwift(row as SwiftImportRow, rowNum)
          : command.sheetFamily === 'depot-sto'
          ? this.validateAndBuildDepotSto(row as DepotStoImportRow, rowNum)
          : this.validateAndBuildVansales(row as VansalesImportRow, rowNum, command.periodMonth!);

      if (!result.ok) {
        results.push(result.error);
        await this.logException('rejected', { ...row }, rowNum, command, importBatchId, orgUnitId, result.error);
        continue;
      }
      await this.insertOrFlag(result.record, command, importBatchId, results, rowNum, orgUnitId);
    }

    const succeeded = results.filter((r) => r.success).length;
    const duplicates = results.filter((r) => !r.success && r.duplicate).length;
    const failed = results.length - succeeded - duplicates;

    return {
      importBatchId,
      summary: { total: results.length, succeeded, duplicates, failed },
      results,
    };
  }

  private validateAndBuildThirdParty(
    row: ThirdPartyImportRow,
    rowNum: number
  ):
    | { ok: true; record: Omit<TransportCostSourceRecord, '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'importBatchId' | 'sourceFileName' | 'orgUnitId'> }
    | { ok: false; error: ImportRowResult } {
    const rawDate = (row.date ?? '').toString();
    const date = parseSourceDate(rawDate);
    if (!date) {
      return {
        ok: false,
        error: {
          row: rowNum,
          success: false,
          column: 'date',
          invalidValue: rawDate,
          error: 'Date is missing or not in a recognised format',
          suggestedFix: 'Use DD.MM.YY, DD.MM.YYYY, or YYYY-MM-DD.',
        },
      };
    }

    const { normalized: registration, raw: registrationRaw } = normalizeRegistration(row.registration);
    if (!registration) {
      return {
        ok: false,
        error: {
          row: rowNum,
          success: false,
          column: 'registration',
          invalidValue: registrationRaw,
          error: 'Truck registration number is required',
          suggestedFix: 'Provide the vehicle registration for this row.',
        },
      };
    }

    const { normalized: transporterNormalized, raw: transporterRaw } = normalizeTransporter(row.transporter);
    if (isKnownInvalidTransporter(transporterNormalized)) {
      return {
        ok: false,
        error: {
          row: rowNum,
          success: false,
          column: 'transporter',
          invalidValue: transporterRaw,
          error: `"${transporterRaw}" looks like a mis-entered label, not a transporter name`,
          suggestedFix: 'Check this row\'s Transporter cell in the source file.',
        },
      };
    }

    return {
      ok: true,
      record: {
        sheetFamily: 'third-party',
        sourceRowNumber: rowNum,
        importedAt: new Date(),
        rawRow: { ...row },
        date,
        rawDate,
        registration,
        registrationRaw,
        transporterNormalized,
        transporterRaw,
        destinationTown: row.destinationTown?.trim() || undefined,
        customerName: row.customerName?.trim() || undefined,
        salesInvoiceNo: row.salesInvoiceNo !== undefined ? String(row.salesInvoiceNo).trim() : undefined,
        amount: parseAmount(row.amount),
        tonnageRaw: parseAmount(row.tonnage),
      },
    };
  }

  /**
   * ONE tolerant parser over a small required-column subset -- see this
   * file's header and TransportCostSheetFamily's doc comment for why
   * that answers the audit's "Swift's schema drifts month to month"
   * concern without a parser per month. Only "Cons. date" and "Cons.
   * Number" are required; every other column is stored as provided (or
   * left unset) -- a later month's sheet losing an optional column, or
   * gaining a new one that ends up in `rawRow` only, does not break
   * import.
   *
   * registration/transporterNormalized are always null/blank here --
   * NEVER fabricated. Swift's real source data has no vehicle or
   * transporter column at all (verified against the real workbook), so
   * this is the honest, structural truth about the row, not a validation
   * gap: normalizeRegistration(undefined)/normalizeTransporter(undefined)
   * are called for real, the same functions every other family uses, so
   * this row's shape stays identical to a 3rd Party row that happens to
   * have a blank registration/transporter cell -- no special-casing.
   */
  private validateAndBuildSwift(
    row: SwiftImportRow,
    rowNum: number
  ):
    | { ok: true; record: Omit<TransportCostSourceRecord, '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'importBatchId' | 'sourceFileName' | 'orgUnitId'> }
    | { ok: false; error: ImportRowResult } {
    const rawDate = (row.consDate ?? '').toString();
    const date = parseSourceDate(rawDate);
    if (!date) {
      return {
        ok: false,
        error: {
          row: rowNum,
          success: false,
          column: 'consDate',
          invalidValue: rawDate,
          error: 'Cons. date is missing or not in a recognised format',
          suggestedFix: 'Use DD.MM.YY, DD.MM.YYYY, or YYYY-MM-DD.',
        },
      };
    }

    const consNumber = row.consNumber !== undefined && row.consNumber !== null ? String(row.consNumber).trim() : '';
    if (!consNumber) {
      return {
        ok: false,
        error: {
          row: rowNum,
          success: false,
          column: 'consNumber',
          invalidValue: '',
          error: 'Cons. Number is required',
          suggestedFix: 'Provide this row\'s consignment number -- a row with no Cons. Number is treated as a non-data row (e.g. a sheet subtotal), not a shipment.',
        },
      };
    }

    const { normalized: registration, raw: registrationRaw } = normalizeRegistration(undefined);
    const { normalized: transporterNormalized, raw: transporterRaw } = normalizeTransporter(undefined);

    return {
      ok: true,
      record: {
        sheetFamily: 'swift',
        sourceRowNumber: rowNum,
        importedAt: new Date(),
        rawRow: { ...row },
        date,
        rawDate,
        registration,
        registrationRaw,
        transporterNormalized,
        transporterRaw,
        destinationTown: row.destinationLocation?.trim() || undefined,
        customerName: row.receiversName?.trim() || undefined,
        salesInvoiceNo: consNumber,
        amount: parseAmount(row.totalIncl),
        tonnageRaw: parseAmount(row.actualWeight),
      },
    };
  }

  /**
   * ONE tolerant parser over the UNION of every real column seen across
   * six months' worth of genuinely different Depot STO sheet layouts --
   * see DEPOT_STO_DECISION.md for the full drift record. Only `date` is
   * required; every other field is optional and simply absent for
   * whichever month's shape didn't carry it (never fabricated). Unlike
   * Swift, a Depot STO row's registration/transporter MAY be present --
   * in the real data, March/April/August rows carry one and June/July's
   * `REG` column exists but is populated in essentially none of the
   * real rows, and May has no such column at all (see
   * DEPOT_STO_DECISION.md's "Vehicle identity" table) --
   * normalizeRegistration is called on whatever `row.registration`
   * holds, honestly null whenever the source cell is empty (whether
   * because the month's shape has no such column, or because the
   * column exists but this particular row's cell is blank) rather than
   * treated as a validation failure, since this family's
   * required-column subset deliberately does not include it.
   */
  private validateAndBuildDepotSto(
    row: DepotStoImportRow,
    rowNum: number
  ):
    | { ok: true; record: Omit<TransportCostSourceRecord, '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'importBatchId' | 'sourceFileName' | 'orgUnitId'> }
    | { ok: false; error: ImportRowResult } {
    const rawDate = (row.date ?? '').toString();
    const date = parseSourceDate(rawDate);
    if (!date) {
      return {
        ok: false,
        error: {
          row: rowNum,
          success: false,
          column: 'date',
          invalidValue: rawDate,
          error: 'Date is missing or not in a recognised format',
          suggestedFix: 'Use DD.MM.YY, DD.MM.YYYY, or YYYY-MM-DD.',
        },
      };
    }

    const { normalized: registration, raw: registrationRaw } = normalizeRegistration(row.registration);
    const { normalized: transporterNormalized, raw: transporterRaw } = normalizeTransporter(row.transporter);
    if (isKnownInvalidTransporter(transporterNormalized)) {
      return {
        ok: false,
        error: {
          row: rowNum,
          success: false,
          column: 'transporter',
          invalidValue: transporterRaw,
          error: `"${transporterRaw}" looks like a mis-entered label, not a transporter name`,
          suggestedFix: 'Check this row\'s Transporter cell in the source file.',
        },
      };
    }

    // May's five named per-product quantity columns -- each can be
    // populated SIMULTANEOUSLY on one row (unlike every other Depot STO
    // column, which is one renamed column per month), so they cannot be
    // folded into one canonical field the way Amount/COSTS/COST are.
    // Keyed by the source column's own literal header text; omitted
    // entirely (never a key with a null/0 value) when absent, so the
    // object's own key set tells a reader exactly which columns this
    // particular row's sheet actually had. null (not {}) when the row's
    // month has no such columns at all -- see
    // DepotStoSourceFields.mayProductQuantities' doc comment.
    const productEntries: Array<[string, number]> = [];
    if (row.goldenGlow2L !== undefined) productEntries.push(['Golden Glow 2L', Number(row.goldenGlow2L)]);
    if (row.olivine2L !== undefined) productEntries.push(['Olivine 2L', Number(row.olivine2L)]);
    if (row.puredrop2L !== undefined) productEntries.push(['Puredrop 2L', Number(row.puredrop2L)]);
    if (row.pureDrop5l !== undefined) productEntries.push(['Pure drop 5l', Number(row.pureDrop5l)]);
    if (row.pureDrop750 !== undefined) productEntries.push(['Pure Drop 750', Number(row.pureDrop750)]);
    const mayProductQuantities = productEntries.length > 0 ? Object.fromEntries(productEntries) : null;

    return {
      ok: true,
      record: {
        sheetFamily: 'depot-sto',
        sourceRowNumber: rowNum,
        importedAt: new Date(),
        rawRow: { ...row },
        date,
        rawDate,
        registration,
        registrationRaw,
        transporterNormalized,
        transporterRaw,
        destinationTown: row.destinationTown?.trim() || undefined,
        customerName: row.customerName?.trim() || undefined,
        salesInvoiceNo: row.salesInvoiceNo !== undefined ? String(row.salesInvoiceNo).trim() : undefined,
        // "Tonnage" (March/April) -- a different real column from
        // "TOONNES" (June/July, see depotSto.toonnesRaw below). Kept
        // separate deliberately: they are two distinct columns in two
        // different months' sheets, never merged into one figure.
        amount: parseAmount(row.amount),
        tonnageRaw: parseAmount(row.tonnage),
        depotSto: {
          stoNumber: row.sto?.trim() || null,
          sourceLocation: row.source?.trim() || null,
          depot: row.depot?.trim() || null,
          commodity: row.commodity?.trim() || null,
          driver: row.driver?.trim() || null,
          mayProductQuantities,
          toonnesRaw: parseAmount(row.toonnes),
          // Raw provenance only -- never coerced, never interpreted.
          // undefined (column absent for this month's shape) becomes
          // null, exactly like every other optional field here; a
          // present false is stored as false, never conflated with
          // "absent".
          signOffMrGurjit: row.mrGurjit ?? null,
          signOffMrInderjeet: row.mrInderjeet ?? null,
          signOffSharmaJi: row.sharmaJi ?? null,
        },
      },
    };
  }

  private validateAndBuildVansales(
    row: VansalesImportRow,
    rowNum: number,
    periodMonth: string
  ):
    | { ok: true; record: Omit<TransportCostSourceRecord, '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'importBatchId' | 'sourceFileName' | 'orgUnitId'> }
    | { ok: false; error: ImportRowResult } {
    const payerName = (row.payerName ?? '').toString().trim();
    if (!payerName) {
      return {
        ok: false,
        error: {
          row: rowNum,
          success: false,
          column: 'payerName',
          invalidValue: row.payerName !== undefined ? String(row.payerName) : '',
          error: 'PayerName is required',
          suggestedFix: 'Provide the payer/owner-operator name for this row.',
        },
      };
    }

    // `truck` holds the transporter name in this sheet family, not a
    // vehicle identifier -- see the audit's Section B terminology-trap
    // note. It is the field validated against the invalid-transporter
    // blocklist and stored as transporterNormalized/transporterRaw.
    const { normalized: transporterNormalized, raw: transporterRaw } = normalizeTransporter(row.truck);
    if (!transporterNormalized) {
      return {
        ok: false,
        error: {
          row: rowNum,
          success: false,
          column: 'truck',
          invalidValue: transporterRaw,
          error: 'TRUCK (transporter) is required',
          suggestedFix: 'Provide the transporter/logistics company operating this route.',
        },
      };
    }
    if (isKnownInvalidTransporter(transporterNormalized)) {
      return {
        ok: false,
        error: {
          row: rowNum,
          success: false,
          column: 'truck',
          invalidValue: transporterRaw,
          error: `"${transporterRaw}" looks like a mis-entered label, not a transporter name`,
          suggestedFix: 'Check this row\'s TRUCK cell in the source file.',
        },
      };
    }

    // REG is genuinely blank on some real Vansales rows (a merged-cell
    // continuation of the row above, for the same payer/product --
    // audit Section K) -- not rejected, just stored as null.
    const { normalized: registration, raw: registrationRaw } = normalizeRegistration(row.registration);

    const weeklyAmounts = [row.week1, row.week2, row.week3, row.week4].map((v) => parseAmount(v));

    return {
      ok: true,
      record: {
        sheetFamily: 'vansales',
        sourceRowNumber: rowNum,
        importedAt: new Date(),
        rawRow: { ...row },
        date: null,
        rawDate: '',
        registration,
        registrationRaw,
        transporterNormalized,
        transporterRaw,
        tonnageRaw: parseAmount(row.tonnage),
        // A Vansales row's cost is a fixed weekly/monthly retainer, not
        // a per-shipment charge -- `amount` is left null (never the
        // retainer figure) so a later phase can't accidentally sum it
        // alongside 3rd Party per-consignment amounts as if they were
        // the same kind of number (audit Section B).
        amount: null,
        vansales: {
          payerName,
          product: row.product?.trim() || null,
          monthlyCostBeforeVat: parseAmount(row.monthlyCostBeforeVat),
          weeklyAmounts,
          total: parseAmount(row.total),
          // Already validated for the whole batch in execute() above --
          // every row in a Vansales batch shares the one declared month.
          periodMonth,
        },
      },
    };
  }

  private async insertOrFlag(
    record: Omit<
      TransportCostSourceRecord,
      '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'importBatchId' | 'sourceFileName' | 'orgUnitId'
    >,
    command: ImportTransportCostCommand,
    importBatchId: string,
    results: ImportRowResult[],
    rowNum: number,
    orgUnitId: string | undefined
  ): Promise<void> {
    const identifier = record.registration ?? record.vansales?.payerName ?? undefined;

    const duplicate = await this.repo.findLikelyDuplicate(
      record.sheetFamily,
      record.registration,
      record.date,
      record.amount,
      command.tenantId
    );
    if (duplicate) {
      const duplicateResult: ImportRowResult = {
        row: rowNum,
        success: false,
        identifier,
        duplicate: true,
        error: `Looks like a duplicate of an existing ${record.sheetFamily} record for ${record.registration} on ${record.date?.toDateString()}`,
        suggestedFix: 'Remove this row if it is a re-import of a file already loaded, or check the source data if it is genuinely a separate record.',
      };
      results.push(duplicateResult);
      await this.logException('duplicate', record.rawRow, rowNum, command, importBatchId, orgUnitId, duplicateResult);
      return;
    }

    let created: TransportCostSourceRecord;
    try {
      created = await this.repo.create(
        {
          ...record,
          ...(orgUnitId ? { orgUnitId } : {}),
          importBatchId,
          sourceFileName: command.sourceFileName,
        },
        command.tenantId,
        command.userId
      );
      results.push({ row: rowNum, success: true, identifier: identifier ?? String(created._id) });
    } catch (err) {
      results.push({
        row: rowNum,
        success: false,
        identifier,
        error: err instanceof Error ? err.message : 'Unknown error while saving this row',
        suggestedFix: 'Check the row values and try again.',
      });
      return;
    }

    // Phase O2: best-effort normalization, run AFTER the row is safely
    // stored. Never lets a matching failure turn an otherwise-successful
    // import row into a reported failure -- the source-evidence row is
    // already durable at this point; normalization is auxiliary
    // bookkeeping that a human can always retry via the review queue or
    // the backfill script (scripts/backfill-transport-cost-normalization.ts).
    try {
      await this.normalizeRow(created, command.tenantId);
    } catch (err) {
      console.error(
        `[ImportTransportCostHandler] normalization failed for row ${rowNum} (record ${created._id}):`,
        err instanceof Error ? err.message : err
      );
    }
  }

  /**
   * ADDED, item 6 (data-quality exceptions export). Persists a
   * TransportCostImportException for a rejected or duplicate-flagged
   * row, so "what got rejected and why" survives past the synchronous
   * ImportTransportCostResult -- see that type's header for what this
   * fixes.
   *
   * Best-effort, same discipline as normalizeRow below it: this is
   * AUXILIARY evidence about an outcome that has already been decided
   * (the row's ImportRowResult is already pushed into `results` by the
   * caller before this runs) -- a failure writing that evidence must
   * never retroactively change what the import reports as having
   * happened to the row, and must never abort the rest of the batch.
   */
  private async logException(
    kind: TransportCostImportExceptionKind,
    rawRow: Record<string, unknown>,
    rowNum: number,
    command: ImportTransportCostCommand,
    importBatchId: string,
    orgUnitId: string | undefined,
    outcome: Pick<ImportRowResult, 'column' | 'invalidValue' | 'error'>
  ): Promise<void> {
    try {
      await this.exceptionRepo.log(
        {
          ...(orgUnitId ? { orgUnitId } : {}),
          importBatchId,
          sheetFamily: command.sheetFamily,
          sourceFileName: command.sourceFileName,
          sourceRowNumber: rowNum,
          kind,
          ...(outcome.column ? { column: outcome.column } : {}),
          reason: outcome.error ?? `Row ${rowNum} was not imported (${kind}).`,
          ...(outcome.invalidValue !== undefined ? { invalidValue: outcome.invalidValue } : {}),
          rawRow: { ...rawRow },
          importedAt: new Date(),
        },
        command.tenantId,
        command.userId
      );
    } catch (err) {
      console.error(
        `[ImportTransportCostHandler] failed to persist ${kind} exception for row ${rowNum}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  /**
   * Runs the O2 matcher for one just-inserted row and applies an
   * immediate resolution when (and only when) the matcher resolved
   * against an already-CONFIRMED identity. Everything else (pending
   * review, blocked, no-value) intentionally leaves the row's
   * transporterPartnerId/contractedVehicleId unset -- see
   * normalization-matcher.service.ts's header for why that is not a
   * gap, it is the whole point of Phase O2.
   */
  private async normalizeRow(created: TransportCostSourceRecord, tenantId: string): Promise<void> {
    const transporterMatch = await this.matcher.matchTransporter(
      created.transporterNormalized,
      created._id!,
      tenantId
    );
    const vehicleMatch = await this.matcher.matchVehicle(
      created.registrationRaw,
      created.registration,
      created._id!,
      tenantId
    );

    const patch: Partial<Pick<TransportCostSourceRecord, 'transporterPartnerId' | 'contractedVehicleId'>> = {};
    if (transporterMatch.outcome === 'resolved-confirmed') {
      patch.transporterPartnerId = transporterMatch.transporterPartnerId;
    }
    if (vehicleMatch.outcome === 'resolved-confirmed') {
      patch.contractedVehicleId = vehicleMatch.contractedVehicleId;
    }
    if (Object.keys(patch).length > 0) {
      await this.repo.update(created._id!, patch, tenantId);
    }
  }
}
