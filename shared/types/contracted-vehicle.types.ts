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

  /** Provenance: the first TransportCostSourceRecord._id that produced this row. */
  firstSeenSourceRecordId: string;
}
