// shared/types/normalization-review.types.ts
//
// Phase O2's manual-review queue. ONE collection shared by both kinds
// (transporter, vehicle) — the workflow (raw value -> candidate ->
// human decision) is identical for both; see the O2 spec's "Fuzzy-match
// + manual review workflow" section.
//
// THE CENTRAL RULE THIS TYPE EXISTS TO ENFORCE: nothing in Phase O2's
// IMPORT-DERIVED matching pipeline ever writes a NEW TransportPartner/
// ContractedVehicle row, and nothing ever sets
// TransportCostSourceRecord.transporterPartnerId/contractedVehicleId,
// except through a confirmed review item resolved here. A candidate
// above the similarity floor is still only a SUGGESTION — see
// normalization-matcher.service.ts and confirm-review-item.handler.ts.
//
// GAP-CLOSURE PASS addendum: a SECOND, separate creation path now
// exists for the specific case this collection cannot serve -- an
// operator entering data manually, live, who needs to reference a
// transporter/vehicle that has never appeared in any import and so has
// no NormalizationReviewItem to resolve. See request-new-transporter
// .command.ts / request-new-vehicle.command.ts and
// master-data-review.service.ts. That path is deliberately NOT a
// bypass of the central rule above: it creates the row with
// reviewStatus: 'needs-review' (the exact status this codebase's
// TransportPartner/ContractedVehicleReviewStatus types already reserved
// for "a possible future... master list entered outside the review
// pipeline" — see those types' own header comments), never 'confirmed',
// so it is still excluded from every confirmed-only search/match/report
// path until a human explicitly confirms it via
// confirm-pending-master-data.command.ts — a second, equally real human
// checkpoint, just not one represented by a row in THIS collection.

import { BaseEntity } from './common.types';

export type NormalizationKind = 'transporter' | 'vehicle';

export type ReviewItemStatus = 'pending' | 'confirmed-match' | 'confirmed-new' | 'rejected';

export interface NormalizationReviewItem extends BaseEntity {
  kind: NormalizationKind;

  /** transporterRaw (normalized) or registrationRaw (normalized) — the value awaiting a decision. */
  rawValue: string;

  /** Best-scoring existing TransportPartner/ContractedVehicle, when one cleared the review floor (0.75 — see the matcher). Absent when no candidate cleared it. */
  candidateEntityId?: string;
  /** 0–1, normalized edit-distance similarity. Absent alongside candidateEntityId. */
  candidateScore?: number;

  /** True only for a 'vehicle' item created from a multi-plate cell (audit Section K) — always routed to review regardless of match, per O2 decision 4. */
  isMultiPlate?: boolean;
  plateComponents?: string[];

  status: ReviewItemStatus;

  /**
   * Every TransportCostSourceRecord._id currently waiting on this
   * decision. Grows as new imports hit the same unresolved raw value
   * (see the O1 import handler's extended insertOrFlag). Capped
   * defensively at a large batch size by the write path, not by this
   * type — an unbounded array is still the right shape for the
   * expected volume (Section K: 141 distinct transporter names, far
   * fewer distinct multi-plate cells).
   */
  sourceRecordIds: string[];

  /** Set once resolved: the TransportPartner/ContractedVehicle._id that every id in sourceRecordIds should now point at. */
  resolvedEntityId?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  /** Required when status is 'rejected' — why this raw value was refused rather than matched or created (e.g. a blocklisted transporter label that slipped past the O1 import guard). */
  rejectedReason?: string;
}
