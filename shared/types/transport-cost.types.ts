// shared/types/transport-cost.types.ts
//
// Phase O1 of the Olivine transport-cost work (see the "Olivine Group —
// Fleet Platform Fit-Gap & Architecture Assessment" audit doc, Section S).
// This phase is SOURCE EVIDENCE ONLY: it imports Olivine's 3rd Party and
// Vansales spreadsheets into a new, append-only collection with full
// provenance. It does not post to the Allocation Ledger, does not compute
// cost-per-km or cost-per-tonne, and is not registered with
// DataSourceRegistry/ReportQueryEngine -- those are later phases (O3/O4),
// deliberately deferred until the audit's Section R confirmations
// (tonnage units, currency/VAT basis, business-stream identity, and so
// on) come back from Olivine. See modules/transport-cost/commands/
// handlers/import-transport-cost.handler.ts for why this shape is what
// it is.

import { OrgUnitScopedEntity } from '@/server/repositories/tenant-scoped.repository';

/**
 * Which Olivine sheet family a row came from. Only the two structurally
 * stable families are handled in Phase O1. Swift, PODs, and Depot STO
 * are deliberately excluded -- the audit found their schemas drift
 * month to month (Swift) or change meaning entirely partway through the
 * year (Depot STO), and their join keys to these two families are
 * unverified (Section D: a full overlap check found ~0 shared values
 * between Sales invoice no, Shipper reference, and POD No.).
 */
export type TransportCostSheetFamily = 'third-party' | 'vansales';

/**
 * Vansales-specific fields, kept in their own nested object rather than
 * flattened onto the record. A Vansales row's cost is a fixed weekly/
 * monthly retainer for a truck, not a per-shipment charge -- mixing it
 * into the same `amount` field as a 3rd Party consignment cost would
 * misrepresent two different unit-economics models as one (audit
 * Section B).
 */
export interface VansalesSourceFields {
  payerName: string | null;
  product: string | null;
  /** "MONTHLY COST BEFORE VAT" in the source. */
  monthlyCostBeforeVat: number | null;
  /** WEEK1..WEEK4 as they appear in the source, left-to-right. A blank
   *  cell is null, never 0 -- see amount's doc comment below for why. */
  weeklyAmounts: Array<number | null>;
  /** The source's own TOTAL column, when present. Section I recommends
   *  treating this as authoritative rather than re-summing weeklyAmounts,
   *  since blank weekly cells are a known merged-cell artifact. */
  total: number | null;
}

/**
 * One imported row from an Olivine transport-cost spreadsheet, stored
 * essentially verbatim (light normalization only -- see the handler)
 * with full provenance. This is SOURCE EVIDENCE, not financial truth:
 * nothing here is read by the Allocation Ledger, and no UI should
 * present it as "transport cost" until a later phase normalizes,
 * dedups, and posts it (audit Section E's source-record /
 * operational-record / ledger-posting distinction).
 *
 * Deliberately does NOT extend Vehicle/Trip/Expense. The audit's
 * Section F finding is that these registrations belong to third-party
 * transporters and owner-operators, not Olivine-owned, telemetry-
 * tracked vehicles in tblvehicles -- forcing this data into
 * tblvehicles/tbltrips/tblexpenses would silently degrade every
 * existing report that assumes GPS- or odometer-sourced data.
 */
export interface TransportCostSourceRecord extends OrgUnitScopedEntity {
  /**
   * Redeclared (not just inherited from OrgUnitScopedEntity) so this
   * file satisfies tests/security/module-scope-conformance.spec.ts's
   * literal-source-text check for an org-unit-scoped module's entity
   * type. The type is identical to the inherited one -- TypeScript
   * allows a compatible re-declaration -- this line exists for the
   * conformance suite's benefit, not the compiler's. See that module's
   * registry entry (server/tenancy/module-scope.registry.ts,
   * `module: 'transport-cost'`) and the handler's org-unit resolution
   * (resolveCreationOrgUnitId, 'explicit' source -- no vehicle exists
   * to inherit scope from; see this file's header).
   */
  orgUnitId?: string;

  sheetFamily: TransportCostSheetFamily;

  // --- Provenance: never mutated after import. If a normalized field
  // below is ever questioned, this is the audit trail. ---
  importBatchId: string;
  sourceFileName: string;
  sourceSheetName?: string;
  /** 1-indexed, matching the row number a person would see if they
   *  opened the source file -- not a zero-indexed array position. */
  sourceRowNumber: number;
  importedAt: Date;
  /** The raw, as-uploaded cell values for this row, keyed by column
   *  header exactly as it appeared in the source file. */
  rawRow: Record<string, unknown>;

  // --- Normalized fields, common across both families. ---

  /** Parsed date, or null when the source cell could not be parsed at
   *  all (kept as a row-level import failure instead -- see the
   *  handler; this field exists for rows that got far enough to be
   *  stored some other way in a future phase, e.g. reconciliation
   *  evidence for a row rejected on a different column). */
  date: Date | null;
  /** The date exactly as typed in the source (e.g. "05.01.26" or an
   *  ISO datetime), before parsing. Source sheets mix a free-text
   *  DD.MM.YY format with real datetime cells (audit Section K) --
   *  this preserves which one this row actually had. */
  rawDate: string;

  /** Registration, normalized: uppercased, internal whitespace
   *  collapsed. Null for a Vansales row with no per-product REG cell
   *  populated (a known merged-cell artifact -- Section K). */
  registration: string | null;
  /** Registration exactly as typed in the source. */
  registrationRaw: string;

  /** Transporter/logistics-company name, trimmed and uppercased for
   *  matching. The audit's Section K found dozens of spelling variants
   *  for the same transporter (e.g. PRINORTH / PRI NORTH / PRINOTH /
   *  PRIRORTH) -- Phase O1 stores both forms and does NO fuzzy merging;
   *  that normalization is Phase O2, gated on a confirmed transporter
   *  master list. */
  transporterNormalized: string | null;
  transporterRaw: string;

  destinationTown?: string;
  customerName?: string;
  salesInvoiceNo?: string;

  /**
   * Cost, in the source's own currency and VAT basis -- BOTH
   * unconfirmed (audit Section R, items 8). null, never 0, when the
   * source cell was blank. This is exactly what the audit's Section K
   * null-rate finding is about (25.5% null in January's 3rd Party
   * sheet, rising to 94.1% by July): a blank cell means "no cost
   * recorded yet", not "zero cost", and treating it as 0 would
   * understate every recent-month total. Never coerce this to 0.
   */
  amount: number | null;

  /**
   * Tonnage exactly as it appears in the source column, UNCONVERTED.
   * Per audit Section K, 3rd Party tonnage values (in the thousands)
   * read as kilograms and Vansales tonnage values (single digits to
   * low teens) read as actual tonnes -- but this is inferred from
   * value ranges, not confirmed. No per-tonne figure is derived from
   * this field anywhere in Phase O1; that is blocked on Section R,
   * item 2.
   */
  tonnageRaw: number | null;

  vansales?: VansalesSourceFields;
}

export interface TransportCostSourceRecordFilters {
  sheetFamily?: TransportCostSheetFamily;
  importBatchId?: string;
  registration?: string;
  startDate?: Date;
  endDate?: Date;
}

/** Per-import-batch counts, surfaced to the importer immediately after
 *  a run and retrievable later for verification (Phase O1's stated
 *  acceptance test: "round-trip every row... confirm zero silent
 *  drops"). */
export interface TransportCostImportBatchSummary {
  importBatchId: string;
  sheetFamily: TransportCostSheetFamily;
  sourceFileName: string;
  importedAt: Date;
  importedBy?: string;
  total: number;
  succeeded: number;
  duplicates: number;
  failed: number;
}
