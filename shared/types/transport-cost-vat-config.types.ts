// shared/types/transport-cost-vat-config.types.ts
//
// Phase O3 ("Phase O3 Spec" tab). What currency and VAT basis a
// TransportCostSourceRecord's `amount` is actually denominated in --
// the fact TransportCostPostingService needs before it can post
// anything, and the audit's Section R item 8 confirmed must be
// DYNAMIC/CONFIGURABLE, never hardcoded (currency and VAT basis are
// "now confirmed to be dynamic, not uniform" -- do not assume fxRate: 1
// or a single VAT basis anywhere in this design).
//
// ---------------------------------------------------------------------
// WHAT SECTION R ITEM 8 CONFIRMED, AND WHAT IT DID NOT
// ---------------------------------------------------------------------
// Confirmed: the RULE -- currency/VAT basis vary per sheet family or
// import, so the platform must let each be configured rather than
// assuming one value everywhere.
// NOT confirmed: the VALUE -- Olivine has never stated, in the audit or
// in any prior instruction, which currency the 3rd Party / Vansales
// sheets are actually denominated in. No currency column exists in
// either source sheet at all (confirmed by inspecting the real source
// workbook). Fabricating a currency would violate this codebase's own
// "never fabricate or zero-fill a missing amount, tonnage unit, or
// currency" rule.
//
// So this collection can be resolved two ways, and BOTH are surfaced
// through `isProvisionalDefault` rather than looking identical to a
// caller:
//   1. A row a human has actually confirmed (confirmedBy/confirmedAt
//      set) -- isProvisionalDefault: false.
//   2. No row exists yet for this sheetFamily/import, so
//      TransportCostVatConfigService falls back to
//      TRANSPORT_COST_VAT_CONFIG_DEFAULTS (vat-config-defaults.ts) --
//      currency 'USD', explicitly flagged provisional. Authorized as an
//      interim, engineering-chosen DEFAULT (not a client confirmation)
//      so Phase O3 can post real postings and Phase O4 can show real
//      reconciled numbers now, correctable in ONE CONFIG CHANGE (a
//      confirmed row here) once Olivine confirms the real currency --
//      no code change, no re-import, no restated history (existing
//      postings keep the currency they were written under, exactly like
//      FinanceSettingsService.update's reportingCurrency-change
//      behaviour). See the delivery README: this is the same
//      "provisional, visibly still open" treatment as the org-unit
//      interim rule in resolveCreationOrgUnitId.

import { BaseEntity } from './common.types';
import { TransportCostSheetFamily, VatBasis } from './transport-cost.types';

export interface TransportCostImportVatConfig extends BaseEntity {
  sheetFamily: TransportCostSheetFamily;

  /**
   * Optional override scoped to ONE import batch. When absent, this row
   * is the sheetFamily-wide default. A batch-scoped row always wins over
   * a sheetFamily-wide one for that batch's own records -- see
   * TransportCostVatConfigService.resolve.
   */
  importBatchId?: string;

  /**
   * ISO 4217, when known. Left UNSET on a row a human has not actually
   * confirmed -- TransportCostVatConfigService is what falls back to the
   * provisional USD default; this field itself is never defaulted, so a
   * saved-but-unconfirmed row can never be mistaken for a real answer.
   */
  currency?: string;

  vatBasis: VatBasis;
  /** Only meaningful once vatBasis is not 'unknown'. */
  vatRatePercent?: number;

  /** Set only on a row a human has actually confirmed -- see the header. */
  confirmedBy?: string;
  confirmedAt?: Date;

  notes?: string;
}

/** What TransportCostVatConfigService.resolve returns -- always has a
 *  currency/vatBasis (falling back to the DEFAULT when unconfirmed), but
 *  never hides which case produced them. */
export interface ResolvedTransportCostVatConfig {
  sheetFamily: TransportCostSheetFamily;
  currency: string;
  vatBasis: VatBasis;
  vatRatePercent?: number;
  /** True when no confirmed config exists and this is
   *  TRANSPORT_COST_VAT_CONFIG_DEFAULTS, not a client confirmation. */
  isProvisionalDefault: boolean;
}
