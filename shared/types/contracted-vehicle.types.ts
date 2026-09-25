// shared/types/contracted-vehicle.types.ts
//
// Phase O2 ("Phase O2 Spec" tab, decision 1): a NEW, separate collection
// for third-party/owner-operator vehicles seen in Olivine's cost data.
// Deliberately does NOT touch shared/types/vehicle.types.ts or add an
// ownershipType field to tblvehicles — those registrations belong to
// transporters, not Olivine-owned, telemetry-tracked vehicles (audit
// Section F).
//
// Organization-level master data, same reasoning as TransportPartner: a
// contracted vehicle can serve more than one branch over its life. This
// is distinct from the per-COST-RECORD org-unit attribution question,
// which is still open — see AllocationPosting/TransportCostSourceRecord
// orgUnitId resolution and the "Org-unit attribution (interim rule)"
// comment in import-transport-cost.handler.ts and
// transport-cost-posting.service.ts.

import { BaseEntity } from './common.types';

/**
 * Placeholder until audit Section R item 1's business-stream dimension
 * is wired into reporting (Phase O4 proper — this file only stores it
 * where the source data reveals it at normalization time). Not read by
 * any report yet.
 */
export type BusinessStream = 'olivine' | 'hypery' | 'surface-wilmar';

export type ContractedVehicleReviewStatus = 'auto-suggested' | 'confirmed' | 'needs-review';

export interface ContractedVehicle extends BaseEntity {
  /**
   * Normalized: uppercase, internal whitespace stripped (identical rule
   * to TransportCostSourceRecord.registration / normalizeRegistration
   * in the O1 handler). For a multi-plate row this is the normalized
   * MULTI-PLATE STRING, never a single component plate — see
   * isMultiPlate below and Normalization rules in the O2 spec.
   */
  registration: string;
  /** First-seen raw form, kept for display/debugging only. */
  registrationRaw: string;

  transporterPartnerId: string; // -> TransportPartner._id

  businessStream?: BusinessStream;

  /**
   * True when this row was created from a source registration cell
   * holding more than one plate (e.g. "AAA 9999/ AAA 9999" — audit
   * Section K). Such cells are NEVER split into two ContractedVehicle
   * rows and NEVER silently resolved to one component plate — decision
   * 4 of the O2 spec.
   */
  isMultiPlate: boolean;
  /** The individual plate tokens, only when isMultiPlate is true — for display only, never used to resolve to a single vehicle. */
  plateComponents?: string[];

  reviewStatus: ContractedVehicleReviewStatus;
  confirmedBy?: string;
  confirmedAt?: Date;

  /**
   * GAP-CLOSURE PASS (Objective 5). Mirrors TransportPartner.rejected/
   * rejectedReason exactly -- same reasoning: a row can be explicitly
   * rejected in review without deleting the audit trail of why. Only
   * reachable via the new "confirm/reject pending master data" review
   * action (see request-new-vehicle.handler.ts and
   * reject-pending-master-data.handler.ts) -- the O1/O2 matcher itself
   * never rejects a ContractedVehicle row today.
   */
  rejected?: boolean;
  rejectedReason?: string;

  /**
   * Provenance: the first TransportCostSourceRecord._id that produced
   * this row. Required for every row created by the O2 matcher's own
   * confirm-new pathway (ConfirmReviewNewHandler), which always resolves
   * a pending import-derived review item with real sourceRecordIds.
   *
   * OPTIONAL as of the gap-closure pass's new "request new vehicle"
   * pathway (RequestNewVehicleHandler): an operator can now request a
   * new vehicle identity directly from a manual-entry form BEFORE the
   * operation itself has been saved as a TransportCostSourceRecord, so
   * there is no id to attach yet. Confirmed by grepping every read site
   * of this field before widening it -- it is written in exactly one
   * place (ConfirmReviewNewHandler) and never queried/joined anywhere
   * else in application logic (provenance/display only), so this widen
   * is safe and does not change any existing behavior for import-derived
   * rows, which continue to always set it.
   */
  firstSeenSourceRecordId?: string;
}
