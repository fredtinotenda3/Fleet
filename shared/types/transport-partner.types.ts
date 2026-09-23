// shared/types/transport-partner.types.ts
//
// Phase O2 of the Olivine transport-cost work (see the "Olivine Group —
// Fleet Platform Fit-Gap & Architecture Assessment" audit doc, "Phase O2
// Spec" tab). Organization-level master data: a transporter isn't owned
// by one branch, so this carries NO orgUnitId (level: 'organization' in
// server/tenancy/module-scope.registry.ts) — see that entry for why.
//
// NEVER auto-merged, and NEVER created directly by the matcher: per
// normalization-review.types.ts's central rule, a TransportPartner row
// is written only by a confirmed 'confirmed-new' review decision (see
// confirm-review-item.handler.ts), which sets reviewStatus: 'confirmed'
// at creation -- a human just said "this is a distinct transporter", so
// there is nothing left to review. 'needs-review' and 'auto-suggested'
// are reserved for a possible future bulk-seeded master list entered
// outside the review pipeline; Phase O2's matcher/review flow never
// produces either. See normalization-matcher.service.ts.

import { BaseEntity } from './common.types';

export type TransportPartnerReviewStatus = 'auto-suggested' | 'confirmed' | 'needs-review';

export interface TransportPartner extends BaseEntity {
  /** Uppercase, whitespace-collapsed display form (matches normalizeTransporter's output in the O1 import handler) — what every report groups by. */
  canonicalName: string;

  /**
   * Every raw spelling variant confirmed to resolve here (e.g. PRINORTH,
   * PRI NORTH, PRINOTH, PRIRORTH → one entry, four aliases — audit
   * Section K). Deduped. Grows only through a confirmed review action,
   * never automatically.
   */
  aliases: string[];

  reviewStatus: TransportPartnerReviewStatus;

  /** Set once a human confirms this identity — either "this is a new transporter" or "these aliases are the same company". */
  confirmedBy?: string;
  confirmedAt?: Date;

  /**
   * Set only when this row was absorbed into another TransportPartner
   * via a confirmed merge. Rows are NEVER deleted on merge — anything
   * that already points at this _id (TransportCostSourceRecord,
   * ContractedVehicle) keeps resolving correctly; a reader follows this
   * pointer rather than assuming the row it has is canonical. See
   * normalization-matcher.service.ts's resolveCanonicalPartnerId.
   */
  mergedIntoPartnerId?: string;

  /** Blocklisted values (VAT EXCL and siblings — see the O1 handler's KNOWN_INVALID_TRANSPORTER_VALUES) can never reach this far, but this flag exists so a row can be explicitly rejected in review without deleting the audit trail of why. */
  rejected?: boolean;
  rejectedReason?: string;
}
