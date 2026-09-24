// shared/types/customer.types.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3 (master data: Customer). See
// OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md Section 6 for the full
// DECISION/REASONING/ASSUMPTION/REVERSIBILITY record this type
// implements.
//
// DECISION: a lightweight, organization-level reference collection --
// deliberately NOT the same heavyweight, human-review-gated model
// TransportPartner/ContractedVehicle use (see those types' own header
// comments and normalization-review.types.ts's "central rule"). A
// customer name on a transport-cost line is a data-entry-consistency
// problem ("stop re-typing 'Olivine Harare Depot' fifty different
// ways"), not a financial-identity-resolution problem: unlike a
// transporter or a vehicle, `customerName` never gates FX resolution,
// vehicle identity, or any ledger computation (see transport-cost-
// posting.service.ts's resolveAmountAndPeriod, unmodified by this
// slice) -- it is a descriptive field. That is what makes it safe for
// a user to create one directly, with no review queue, unlike
// TransportPartner/ContractedVehicle.
//
// Organization-level (no orgUnitId), mirroring TransportPartner/
// ContractedVehicle's own precedent: a customer is not owned by one
// branch, and duplicate detection must work across the whole tenant,
// not per branch (a branch-scoped "Olivine" and a branch-scoped
// "Olivine" in a different branch would otherwise silently duplicate).
// See server/tenancy/module-scope.registry.ts's transport-cost entry
// ("MIXED-LEVEL MODULE") for the registered scoping decision.
//
// Deliberately NOT referenced from TransportCostSourceRecord/
// TransportCostLine by id this slice -- `customerName` on those types
// remains a plain string, exactly as Slice 1/2 left it. Selecting a
// Customer here fills that existing text field with this record's
// `name`, the same as if the operator had typed it correctly by hand.
// See the gap analysis for why a foreign-key migration was
// deliberately not attempted in the same pass as the search/create UX.

import { BaseEntity } from './common.types';

export interface Customer extends BaseEntity {
  /** Display name, exactly as confirmed at creation (or corrected since, via update -- not built this pass, see the gap analysis's "management UI" deferral). */
  name: string;

  /**
   * Uppercase, whitespace-collapsed form of `name` -- the de-duplication
   * and search key (see normalizeMasterDataName in modules/transport-
   * cost/utils/normalization.utils.ts, the exact same rule
   * normalizeTransporter already uses, reused rather than
   * re-implemented). "Harare"/"HARARE"/"harare " all normalize to the
   * same value, which is what lets create() detect an existing record
   * rather than silently duplicating one.
   */
  normalizedName: string;

  /**
   * Default true. false = "inactive": excluded from ordinary search
   * results (so it stops being offered for NEW entries) but never
   * deleted and still resolvable by id -- a historical
   * TransportCostSourceRecord that used to reference this customer
   * (by name, not by id -- see the header above) must keep displaying
   * correctly regardless of this flag. Distinct from BaseEntity's own
   * isDeleted/deletedAt (soft-delete), which this type deliberately
   * does not use for deactivation: isDeleted hides a row from every
   * default read including a historical lookup, which is the opposite
   * of what "inactive but still valid for history" requires.
   */
  active: boolean;
}
