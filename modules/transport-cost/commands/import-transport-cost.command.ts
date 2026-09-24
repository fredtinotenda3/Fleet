// modules/transport-cost/commands/import-transport-cost.command.ts
//
// Bulk import command for Olivine transport-cost source records. Four
// row shapes (one per sheet family -- see the audit's Section B for why
// they can't share a shape: 3rd Party bills per consignment, Vansales
// bills a fixed weekly retainer, Swift bills per consignment like 3rd
// Party but with no vehicle/transporter column at all, Depot STO is a
// dated stock movement whose OWN column layout drifts across four
// distinct shapes over six real months -- see DEPOT_STO_DECISION.md), a
// single command class distinguished by `sheetFamily`, mirroring
// ImportExpensesCommand/ImportTripsCommand's shape (rows + tenantId +
// WriteScope + userId).

import { BaseCommand } from '@/server/cqrs/command';
import { WriteScope } from '@/server/tenancy/write-scope';
import { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';

/** Raw row shape for the "3rd Party" sheet -- see audit Section B,
 *  Family 2. (March/April's "Depot STO" sheets happen to share this
 *  exact 8-column layout, but post under the separate 'depot-sto'
 *  sheetFamily via DepotStoImportRow below, not this type -- a stock
 *  transfer and an ordinary delivery are different business events even
 *  when two months' columns coincide; see DEPOT_STO_DECISION.md.) */
export interface ThirdPartyImportRow {
  rowNumber: number;
  date?: string;
  customerName?: string;
  transporter?: string;
  salesInvoiceNo?: string | number;
  tonnage?: string | number;
  registration?: string;
  destinationTown?: string;
  amount?: string | number;
  /** OLIVINE LIVE OPERATING MODEL, item 3: which of Hypery/Olivine/Surface
   *  this delivery was incurred facing -- see cost-facing-company.types.ts. */
  costFacingCompany?: string;
}

/** Raw row shape for the "Vansales" sheets (audit Section B, Family 4).
 *  `truck` deliberately holds the transporter name, not a vehicle
 *  identifier -- see the audit's terminology-trap note; `registration`
 *  is the real vehicle identifier. */
export interface VansalesImportRow {
  rowNumber: number;
  payerName?: string;
  registration?: string;
  tonnage?: string | number;
  product?: string;
  truck?: string;
  monthlyCostBeforeVat?: string | number;
  week1?: string | number;
  week2?: string | number;
  week3?: string | number;
  week4?: string | number;
  total?: string | number;
  /** OLIVINE LIVE OPERATING MODEL, item 3 -- see ThirdPartyImportRow's own doc comment. */
  costFacingCompany?: string;
}

/**
 * Raw row shape for the "Swift" sheets (audit Section B, Family 3 --
 * see shared/types/transport-cost.types.ts's TransportCostSheetFamily
 * doc comment for the full rationale). Column keys are this codebase's
 * own naming, mapped from the real "JAN-26 Swift" sheet's literal
 * headers via the frontend's ImportColumnDef labels, the same pattern
 * 3rd Party/Vansales already use -- NOT a literal header-string match.
 * Deliberately has no registration/transporter field: the source data
 * has none (verified against the real workbook).
 */
export interface SwiftImportRow {
  rowNumber: number;
  /** "Cons. date" -- required. */
  consDate?: string;
  /** "Cons. Number" -- required; this row's own unique reference, the
   *  closest thing this family has to registration's role of "what
   *  makes this a real row, not a subtotal/footer". */
  consNumber?: string | number;
  /** "Shipper reference" -- one of the three columns the audit's
   *  Section D join-key check tested (and found ~0 overlap for); stored
   *  for provenance only, never used as a join key here. */
  shipperReference?: string | number;
  /** "Receivers Name". */
  receiversName?: string;
  /** "Destination location". */
  destinationLocation?: string;
  /** "Actual weight" -- unconverted, same raw-storage convention as
   *  ThirdPartyImportRow.tonnage. */
  actualWeight?: string | number;
  /** "Total(Excl)". */
  totalExcl?: string | number;
  /** "Tax amount". */
  taxAmount?: string | number;
  /** "Total(Incl)" -- the posted `amount`. Chosen over Total(Excl) for
   *  the same reason Vansales posts TOTAL rather than a component
   *  figure: the final, all-in settled amount, not an intermediate one. */
  totalIncl?: string | number;
  /** OLIVINE LIVE OPERATING MODEL, item 3 -- see ThirdPartyImportRow's own doc comment. */
  costFacingCompany?: string;
}

/**
 * Raw row shape for the six real "Depot STO" sheets (March-August --
 * see shared/types/transport-cost.types.ts's TransportCostSheetFamily
 * doc comment and DEPOT_STO_DECISION.md for the full drift record and
 * reasoning). ONE canonical shape covers all six months: it is the
 * UNION of every column seen across March/April's 3rd-Party-shaped
 * sheets, May's per-product-quantity + sign-off sheet, June/July's
 * Commodity/REG/DRIVER/TOONNES sheet, and August's variant without
 * TOONNES/DRIVER. Only `date` is required (validateAndBuildDepotSto) --
 * every other field is optional and simply absent for whichever
 * month's shape didn't carry it, never fabricated.
 */
export interface DepotStoImportRow {
  rowNumber: number;
  /** "DATE" (or "Date" in March/April) -- required, this row's posting date, used as-is. */
  date?: string;
  /** "STO" -- the stock-transfer order reference (May onward). */
  sto?: string;
  /** "SOURCE" -- originating depot/location (May onward). */
  source?: string;
  /** "DEPOT" -- destination depot (May onward). */
  depot?: string;
  /** "Commodity" (June onward) -- free text. */
  commodity?: string;
  /** "Customer name" (March/April's 3rd-Party-shaped sheets only). */
  customerName?: string;
  /** "Transporter" -- present in every real variant. */
  transporter?: string;
  /** "Sales invoice no" (March/April only). */
  salesInvoiceNo?: string | number;
  /** "Tonnage" (March/April only -- a different column from TOONNES below). */
  tonnage?: string | number;
  /** "Truck registration no" (March/April) or "REG" (June/July/August) --
   *  all map to this one field. May's sheet has no such column at all.
   *  June/July's `REG` column exists in the schema but is populated in
   *  essentially none of the real rows (0/24, 1/84) -- only
   *  March/April/August carry a real, populated registration in
   *  practice. See DEPOT_STO_DECISION.md's "Vehicle identity" table. */
  registration?: string;
  /** "Destination Town" (March/April only). */
  destinationTown?: string;
  /** "DRIVER" (June/July only). */
  driver?: string;
  /** "TOONNES" (June/July only -- the source's own literal spelling). */
  toonnes?: string | number;
  /** "Amount" (March/April) / "COSTS" (May) / "COST" (June-August) --
   *  all map to this one canonical field; the literal header differs by
   *  month, the posted figure's meaning does not. */
  amount?: string | number;
  /** "Mr Gurjit" (May onward) -- raw provenance only, see
   *  DepotStoSourceFields.signOffMrGurjit's doc comment. */
  mrGurjit?: boolean | string;
  /** "Mr Inderjeet" (May onward). */
  mrInderjeet?: boolean | string;
  /** "Sharma Ji" (May onward). */
  sharmaJi?: boolean | string;
  /**
   * May's sheet spreads quantity across five named per-product columns
   * instead of one `Commodity` figure -- unlike every other Depot STO
   * column drift (which is a rename of ONE column across months), these
   * five can all be populated on the SAME row simultaneously, so they
   * cannot be folded into one canonical field without losing data (see
   * DEPOT_STO_DECISION.md and DepotStoSourceFields.mayProductQuantities).
   * Field names are camelCased from the source header; the literal
   * header text is preserved as each key in the stored
   * `mayProductQuantities` object, not here.
   */
  goldenGlow2L?: string | number;
  olivine2L?: string | number;
  puredrop2L?: string | number;
  pureDrop5l?: string | number;
  pureDrop750?: string | number;
  /** OLIVINE LIVE OPERATING MODEL, item 3 -- see ThirdPartyImportRow's own doc comment. */
  costFacingCompany?: string;
}

export type TransportCostImportRow = ThirdPartyImportRow | VansalesImportRow | SwiftImportRow | DepotStoImportRow;

export class ImportTransportCostCommand extends BaseCommand {
  static readonly commandName = 'ImportTransportCostCommand';

  constructor(
    public readonly sheetFamily: TransportCostSheetFamily,
    public readonly rows: TransportCostImportRow[],
    public readonly tenantId: string,
    /** Authority this write runs under. See server/tenancy/write-scope.ts. */
    public readonly scope: WriteScope,
    public readonly sourceFileName: string,
    public readonly userId?: string,
    /**
     * Vansales periodization Option A (VANSALES_PERIODIZATION_DECISION.md):
     * required, "YYYY-MM", when `sheetFamily === 'vansales'` -- the
     * calendar month this WHOLE BATCH's retainer rows cover, supplied by
     * the person running the import, the same trust level `sourceFileName`
     * already carries. The handler rejects the entire batch up front
     * (before inserting any row) if this is missing or malformed for a
     * Vansales import, rather than guessing per row. Added as the last,
     * optional constructor param specifically so it does not break any
     * existing positional call site for a 'third-party' import, where it
     * is simply unused.
     */
    public readonly periodMonth?: string
  ) {
    super(ImportTransportCostCommand.commandName);
  }
}
