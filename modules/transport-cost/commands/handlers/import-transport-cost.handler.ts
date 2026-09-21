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

import { ICommandHandler } from '@/server/cqrs/command';
import {
  ImportTransportCostCommand,
  ThirdPartyImportRow,
  VansalesImportRow,
} from '../import-transport-cost.command';
import { TransportCostSourceRecordRepository } from '@/modules/transport-cost/repositories/transport-cost-source-record.repository';
import { TransportCostSourceRecord } from '@/shared/types/transport-cost.types';
import { resolveCreationOrgUnitId } from '@/server/utils/tenant-context.utils';
import { ForbiddenError } from '@/server/errors/app.errors';
import { randomUUID } from 'crypto';

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

// Values seen in the source data's Transporter/TRUCK columns that are
// clearly not transporter names -- a mis-entered spreadsheet label, not
// a company (audit Section K: "VAT EXCL" appears seven times in the
// Transporter column across the workbook). Rejected rather than
// imported as if it were a real transporter, so it can never silently
// pollute a future transporter master list or cost-by-transporter
// report.
const KNOWN_INVALID_TRANSPORTER_VALUES = new Set(['VAT EXCL', 'VAT INCL', 'N/A', 'NA', 'TOTAL']);

const DATE_DMY_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/;
const DATE_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Parses the two date shapes actually seen in Olivine's source sheets
 * (audit Section K): free-text `DD.MM.YY` / `DD.MM.YYYY`, and ISO
 * strings (in case a re-exported template uses them). Deliberately does
 * NOT fall back to `new Date(raw)` for anything else -- that
 * constructor's locale-dependent parsing of ambiguous strings is
 * exactly the kind of silent coercion the audit's Section K calls for
 * "parse defensively and reject rather than silently coerce".
 */
function parseSourceDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const dmy = DATE_DMY_RE.exec(trimmed);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (dmy[3].length === 2) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    // Guards against JS's date-rollover behaviour for invalid combinations
    // (e.g. "31.02.26" would otherwise silently become March 3rd).
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
      return null;
    }
    return d;
  }

  if (DATE_ISO_RE.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Never returns 0 for a blank/unparseable cell -- returns null instead.
 * See the file header: coercing a blank Amount to 0 is the specific
 * mistake this handler exists to avoid.
 */
function parseAmount(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const cleaned = trimmed.replace(/[^0-9.-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeRegistration(raw: string | undefined): { normalized: string | null; raw: string } {
  const r = (raw ?? '').toString().trim();
  if (!r) return { normalized: null, raw: r };
  // Collapses internal whitespace and uppercases (audit Section K: at
  // least 40 plates in the source data have multiple raw spellings that
  // differ only by whitespace, e.g. "AGL8230" / "AGL 8230" / "AGL  8230").
  // Deliberately does NOT attempt to split a multi-plate cell (e.g.
  // "AAA 9999/ AAA 9999") -- that is flagged as its own explicit case in
  // the audit, not silently parsed here.
  return { normalized: r.replace(/\s+/g, '').toUpperCase(), raw: r };
}

function normalizeTransporter(raw: string | undefined): { normalized: string | null; raw: string } {
  const r = (raw ?? '').toString().trim();
  if (!r) return { normalized: null, raw: r };
  return { normalized: r.toUpperCase().replace(/\s+/g, ' '), raw: r };
}

function isKnownInvalidTransporter(normalized: string | null): boolean {
  return normalized !== null && KNOWN_INVALID_TRANSPORTER_VALUES.has(normalized);
}

export class ImportTransportCostHandler
  implements ICommandHandler<ImportTransportCostCommand, ImportTransportCostResult>
{
  constructor(private readonly repo: TransportCostSourceRecordRepository) {}

  async execute(command: ImportTransportCostCommand): Promise<ImportTransportCostResult> {
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

      if (command.sheetFamily === 'third-party') {
        const result = this.validateAndBuildThirdParty(row as ThirdPartyImportRow, rowNum);
        if (!result.ok) {
          results.push(result.error);
          continue;
        }
        await this.insertOrFlag(result.record, command, importBatchId, results, rowNum, orgUnitId);
      } else {
        const result = this.validateAndBuildVansales(row as VansalesImportRow, rowNum);
        if (!result.ok) {
          results.push(result.error);
          continue;
        }
        await this.insertOrFlag(result.record, command, importBatchId, results, rowNum, orgUnitId);
      }
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

  private validateAndBuildVansales(
    row: VansalesImportRow,
    rowNum: number
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
      results.push({
        row: rowNum,
        success: false,
        identifier,
        duplicate: true,
        error: `Looks like a duplicate of an existing ${record.sheetFamily} record for ${record.registration} on ${record.date?.toDateString()}`,
        suggestedFix: 'Remove this row if it is a re-import of a file already loaded, or check the source data if it is genuinely a separate record.',
      });
      return;
    }

    try {
      const created = await this.repo.create(
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
    }
  }
}
