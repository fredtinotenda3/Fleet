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
//
// PHASE O2 / O3 ADDITIVE FIELDS (see "Phase O2 Spec" / "Phase O3 Spec"
// tabs on the audit doc): every field added below is optional and
// unset on every existing O1 row until a later phase's own write path
// (the O2 normalization matcher, the O3 posting service, the O3
// currency/VAT backfill) resolves it. Nothing here breaks O1's own
// compiled callers.

import { OrgUnitScopedEntity } from '@/server/repositories/tenant-scoped.repository';
import { CostFacingCompany } from './cost-facing-company.types';

/**
 * Which Olivine sheet family a row came from.
 *
 * 'swift' added in the Swift-import slice (see import-transport-cost
 * .handler.ts's validateAndBuildSwift): the audit's original concern was
 * that Swift's schema drifts month to month, which is answered here by
 * ONE tolerant parser over a small required-column subset (Cons. date +
 * Cons. Number) rather than a parser per month -- an optional column
 * missing or reordered in a later month's sheet does not break import,
 * only a genuinely required one does, with an explicit per-row reason.
 * Swift's SOURCE DATA carries no registration/transporter column at all
 * (verified against the real "JAN-26 Swift" sheet: Cons. date, Cons.
 * Number, Shipper reference, Receivers Name, Destination location,
 * Actual weight, Total(Excl), Tax amount, Total(Incl) -- nine columns,
 * none of them a vehicle identifier), so a Swift row can be imported and
 * even posted to the ledger, but can NEVER resolve a contractedVehicleId
 * -- see TransportCostPostingService's header for why that is a
 * structural, permanent fact about this source data, not a gap to close
 * by inventing one.
 *
 * 'depot-sto' added in the Depot STO/O5 slice (see import-transport-cost
 * .handler.ts's validateAndBuildDepotSto and DEPOT_STO_DECISION.md for
 * the full record). The audit's original concern -- that Depot STO's
 * schema changes meaning partway through the year -- turned out to
 * understate the real drift once the actual workbook was inspected:
 * SIX real months exist (March-August, not just "May-August" as an
 * earlier doc comment assumed), across FOUR genuinely different column
 * layouts (March/April share 3rd Party's own 8-column shape; May adds
 * per-product quantity columns plus three sign-off columns; June/July
 * replace those with a free-text Commodity column plus REG/DRIVER/
 * TOONNES; August drops TOONNES/DRIVER again). One tolerant parser
 * still covers this, the same way it covers Swift: only `DATE` is
 * required (the one column every real variant has), everything else is
 * optional and stored when present. A stock-transfer's cost is posted
 * under `stock-transfer` (never `third-party-transport`), using DATE
 * as-is for both periodStart/periodEnd -- a dated stock movement, not a
 * fixed retainer (never Vansales's declared-periodMonth convention).
 * Depot STO's vehicle-identity resolvability is a DATA fact, not just a
 * schema fact: March/April/August rows carry a real, populated
 * registration in practice (100%/100%/98.8% of real rows); May's sheet
 * has no registration column at all; June/July DO have a `REG` column
 * in the schema but it's populated in essentially none of the real
 * rows (0/24, 1/84) -- so, unlike Swift, vehicle-identity resolution is
 * possible for SOME Depot STO rows, not none, but "possible" tracks the
 * real data, not merely which months' header row includes a
 * registration-shaped column; see DEPOT_STO_DECISION.md's "Vehicle
 * identity" table.
 *
 * PODs remain out of scope entirely -- Section D's join-key finding
 * (below) applies to them, not to whether Swift/Depot STO can be
 * imported.
 *
 * The audit's Section D join-key finding (~0 shared values between Sales
 * invoice no, Shipper reference, and POD No. across families) is why
 * Swift/3rd Party/Depot STO/PODs are never hard-joined anywhere in this
 * codebase -- each source family's rows are independent evidence, not
 * rows to be reconciled against each other's identifiers.
 */
export type TransportCostSheetFamily = 'third-party' | 'vansales' | 'swift' | 'depot-sto';

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
  /**
   * VANSALES PERIODIZATION DECISION (see VANSALES_PERIODIZATION_DECISION.md,
   * Option A): the calendar month this row's retainer covers, as
   * "YYYY-MM" -- required at import time, supplied explicitly by the
   * person running the import, and NEVER inferred from the sheet-tab's
   * free-text name (e.g. "JAN-26 Vansales"). null only for a row
   * imported before this field existed; TransportCostPostingService
   * treats that the same as a missing period and skips posting it
   * (`status: 'skipped', reason: 'missing-period-month'`) rather than
   * guessing. Copied from ImportTransportCostCommand.periodMonth onto
   * every row in the batch at import time (see the handler), so posting
   * never has to re-derive it from batch metadata later.
   */
  periodMonth: string | null;
}

/**
 * Depot STO-specific fields (Phase O5, see DEPOT_STO_DECISION.md), kept
 * in their own nested object for the same reason `VansalesSourceFields`
 * is: these concepts (a stock-transfer number, a source/destination
 * depot, a free-text commodity, three named sign-off columns, a raw
 * tonnage figure) don't exist for any other sheet family and mixing
 * them onto the shared record would misrepresent this as an ordinary
 * delivery.
 */
export interface DepotStoSourceFields {
  /** "STO" -- the stock-transfer order number/reference, when present. */
  stoNumber: string | null;
  /** "SOURCE" -- the originating depot/location, when present. */
  sourceLocation: string | null;
  /** "DEPOT" -- the destination depot, when present. */
  depot: string | null;
  /** "Commodity" (June onward) -- free text; May's sheet instead spreads
   *  quantity across five named per-product columns -- see
   *  `mayProductQuantities` below for how those are preserved. */
  commodity: string | null;
  /** "DRIVER" (June/July only). */
  driver: string | null;
  /**
   * May's sheet has five named per-product quantity columns instead of
   * one `Commodity` figure ("Golden Glow 2L", "Olivine 2L", "Puredrop
   * 2L", "Pure drop 5l", "Pure Drop 750") -- each an unconverted raw
   * number, keyed by the source column's own literal header text
   * (verbatim, not normalized), present only for a genuine May row.
   * Preserved as its own object, rather than silently dropped, because
   * this is the one case in the whole Depot STO shape where a real
   * source column has no single canonical field to fold into --
   * unlike `amount` (Amount/COSTS/COST, one column per month, same
   * meaning) these are five DIFFERENT columns that can appear
   * SIMULTANEOUSLY on one row, so collapsing them into one field would
   * lose real data rather than just rename it. Never summed, never
   * read by any computation -- raw provenance only, same discipline as
   * `toonnesRaw`/the sign-off fields below. null when the row's month
   * has no such columns (every month except May).
   */
  mayProductQuantities: Record<string, number> | null;
  /**
   * "TOONNES" (June/July only -- this spelling, not a typo introduced
   * here, is the real source column's own literal header). Unconverted,
   * same raw-storage convention as `tonnageRaw` on the shared record --
   * no computation anywhere in this codebase reads it yet. See
   * DEPOT_STO_DECISION.md's "normalize only for computation" note.
   */
  toonnesRaw: number | null;
  /**
   * The three named sign-off columns ("Mr Gurjit", "Mr Inderjeet",
   * "Sharma Ji"), present from May onward. Stored EXACTLY as the source
   * cell held it -- real values observed are booleans, but this is
   * typed to also accept a string so a future month's free-text value
   * (an initial, a date, anything else) is preserved rather than
   * coerced or dropped. NEVER interpreted: this codebase does not know,
   * and does not guess, what true/false or presence/absence means for
   * any of these three -- see DEPOT_STO_DECISION.md. null when the
   * source sheet for this row's month has no such column at all
   * (March/April), never fabricated as false.
   */
  signOffMrGurjit: boolean | string | null;
  signOffMrInderjeet: boolean | string | null;
  signOffSharmaJi: boolean | string | null;
}

/**
 * OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7 -- see
 * OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md Section 5 for the full
 * design record this implements). One repeatable load/consignment
 * within a single transport OPERATION: "one transporter, one truck, one
 * trip -- but potentially several invoices/customers/destinations riding
 * on it."
 *
 * DELIBERATELY DOES NOT INCLUDE A COST FIELD. Cost is, and remains, a
 * PARENT-level fact (`TransportCostSourceRecord.amount`) -- the client's
 * own Slice 2 brief lists "transport-level cost" as a parent field, not
 * a line field, which resolves what would otherwise be an open costing
 * question (see this file's header note on TransportCostSourceRecord.lines
 * for the full financial-integrity argument: a line array must never be
 * able to multiply the cost a transport operation posts).
 *
 * DELIBERATELY DOES NOT INCLUDE A SEPARATE "receiver name" DISTINCT FROM
 * "customer": inspected against the current schema before adding this
 * (per this slice's own explicit instruction not to blindly copy the
 * client's field list) and found that the codebase already treats
 * Swift's "Receivers Name" as the same concept as 3rd Party's "Customer
 * name" -- both map into one `customerName` field today
 * (validateAndBuildSwift). Introducing a second, always-empty
 * `receiverName` field with no data behind it would be exactly the kind
 * of speculative field the client's own brief warns against. One
 * `customerName` field is used for both.
 *
 * DOES include `consignmentNumber` as its own field, separate from
 * `salesInvoiceNo`, specifically for the NEW manual-entry multi-line
 * workflow (the client's own wireframe lists "Invoice" and "Consignment"
 * as two distinct fields) -- unlike "receiver", a consignment number and
 * an invoice number are genuinely different real-world identifiers even
 * though the CURRENT bulk-import schema has only ever needed one
 * reference-number field per row (see TransportCostSheetFamily's own doc
 * comment on the audit's Section D join-key finding: Sales invoice no /
 * Shipper reference / Cons. Number are different numbering schemes
 * across sheet families, never a proof that "invoice" and "consignment"
 * are the same concept). `consignmentNumber` is therefore populated only
 * by the manual multi-line entry path; every bulk-imported and legacy
 * line leaves it unset, never fabricated from `salesInvoiceNo`.
 */
export interface TransportCostLine {
  /** 1-indexed position within the parent's `lines` array -- display
   *  order only, not a database key, not a business identifier. */
  lineNumber: number;
  salesInvoiceNo?: string;
  customerName?: string;
  consignmentNumber?: string;
  destinationTown?: string;
  /** Same raw-storage, never-coerced-to-0 discipline as the parent
   *  record's own `tonnageRaw` -- see that field's doc comment. */
  tonnageRaw: number | null;
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
   * OLIVINE LIVE OPERATING MODEL, item 2/3/5 (see
   * cost-facing-company.types.ts's header for the full rationale). Which
   * of Hypery/Olivine/Surface this transaction was incurred facing --
   * captured explicitly at entry (manual or bulk import), never derived
   * from a sheet name, a transporter, or a vehicle. null on every row
   * imported before this field existed (the January 2026 historical
   * data) and on any row genuinely imported without it -- rendered as
   * "Unattributed" everywhere, never guessed retroactively. Required
   * (validated by ImportTransportCostHandler) for every row imported
   * through the current handler, across all four sheet families.
   */
  costFacingCompany?: CostFacingCompany | null;

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
  depotSto?: DepotStoSourceFields;

  /**
   * OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7). The full set of
   * loads/consignments belonging to this ONE transport operation. See
   * TransportCostLine's own doc comment for the field-by-field design
   * reasoning.
   *
   * INVARIANTS, load-bearing for every consumer of this record:
   *
   *   1. UNDEFINED means "imported before this field existed" (every row
   *      from Slice 1 and earlier) -- never backfilled or fabricated
   *      retroactively for historical data, same discipline as
   *      `costFacingCompany` before it.
   *   2. Populated for EVERY row imported through the current handler,
   *      across all four sheet families, always with at least one
   *      element -- even a family/row that never supports genuine
   *      multi-line entry (Vansales/Swift/Depot STO, and a 3rd Party row
   *      submitted the ordinary single-line way) still gets a one-
   *      element `lines` array, so a consumer that wants full load
   *      detail never has to special-case "does this record have
   *      lines or not" -- only "does it have one or several".
   *   3. `lines[0]` is ALWAYS kept in sync with this record's own flat
   *      `salesInvoiceNo`/`customerName`/`destinationTown`/`tonnageRaw`
   *      fields -- they are the SAME data, not two independent copies
   *      that could drift. This is what makes the migration additive:
   *      every existing consumer that reads the flat scalar fields
   *      directly (describePosting, the data-quality exception export,
   *      any future report) keeps working completely unchanged, reading
   *      what is effectively "load 1" of the operation, without knowing
   *      `lines` exists at all. A NEW consumer that wants the full
   *      multi-load picture reads `lines`.
   *   4. `lines.length > 1` is the one authoritative signal that this is
   *      a genuine multi-load operation. Currently only the 3rd Party
   *      manual-entry form can produce this (see
   *      ImportTransportCostHandler.resolveLines) -- bulk-imported rows
   *      and the other three sheet families always produce exactly one
   *      line, per this slice's own "do not force a multi-line model
   *      onto datasets where the source structure is inherently
   *      one-line" instruction (OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md
   *      Section 5's recommended sequencing: bulk-import grouping is
   *      deliberately NOT invented this pass, since there is no reliable
   *      signal in the existing source files to distinguish "two rows
   *      are the same trip" from "two rows are two separate trips that
   *      happen to share a truck/transporter/date" without risking a
   *      false merge of real financial records).
   *   5. NEVER carries a cost/amount field -- see TransportCostLine's
   *      own doc comment. `amount` above is, and remains, the ONLY cost
   *      figure this record represents, regardless of how many lines it
   *      has. TransportCostPostingService posts exactly one figure per
   *      source record, structurally incapable of reading `lines` for
   *      money (verified by tests/unit/transport-cost/
   *      transport-cost-posting.service.multiline.spec.ts).
   */
  lines?: TransportCostLine[];

  // --- Phase O2 additive fields (see "Phase O2 Spec" tab). Unset on
  // every existing O1 row and every new import until the O2 matching
  // step (auto-suggest + confirmed NormalizationReviewItem) resolves
  // it -- never written directly, see normalization-review.types.ts's
  // header for why. ---

  /** Set once resolved via a confirmed NormalizationReviewItem. -> TransportPartner._id */
  transporterPartnerId?: string;
  /** Set once resolved via a confirmed NormalizationReviewItem (including a confirmed multi-plate row). -> ContractedVehicle._id */
  contractedVehicleId?: string;

  // --- Phase O3 additive fields (see "Phase O3 Spec" tab). Unset on
  // every existing O1 row until the O3 currency/VAT backfill script or
  // a fresh import populates it -- amount above stays the source-of-
  // record cost; these describe what that number IS, never replace it. ---

  /** ISO 4217, when known. Unset (not "guessed") until the backfill or a per-import VAT config resolves it -- see TransportCostImportVatConfig. */
  currency?: string;
  /** Whether `amount` (and rawRow's own total) is VAT-inclusive, VAT-exclusive, or not yet determined for this row's sheet/period. */
  vatBasis?: VatBasis;
  /** Derived net (ex-VAT) figure, only once vatBasis is known -- null, never 0, when VAT-exclusive-ness can't be derived from this row alone. */
  netAmount?: number | null;
  /** Derived gross (incl-VAT) figure, same null-vs-0 rule as netAmount. */
  grossAmount?: number | null;
}

/** Whether a row's `amount` is VAT-inclusive, VAT-exclusive, or not yet
 *  determined. 'unknown' is the default for every O1 row and stays
 *  'unknown' until a TransportCostImportVatConfig or explicit backfill
 *  resolves it -- never inferred by guessing. */
export type VatBasis = 'inclusive' | 'exclusive' | 'unknown';

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
