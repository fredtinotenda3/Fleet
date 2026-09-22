// modules/transport-cost/services/normalization-matcher.service.ts
//
// Phase O2 ("Phase O2 Spec" tab). Given one TransportCostSourceRecord's
// raw transporter name or registration, decides whether it already
// resolves to a CONFIRMED master-data row, and if not, files (or adds
// to) a NormalizationReviewItem -- never creates a TransportPartner or
// ContractedVehicle row itself, and never sets
// transporterPartnerId/contractedVehicleId except when resolving to an
// already-confirmed identity. See normalization-review.types.ts's
// "central rule".
//
// Transporter matching is FUZZY (Levenshtein similarity via
// fastest-levenshtein) because free-text company names genuinely drift
// in spelling (audit Section K: PRINORTH / PRI NORTH / PRINOTH /
// PRIRORTH). Vehicle/registration matching is DETERMINISTIC ONLY --
// normalizeRegistration's exact output or nothing; a plate is either
// the same plate or it isn't, and guessing "close" plates as the same
// vehicle would misattribute cost to the wrong truck.
//
// SUGGEST ONLY, NEVER AUTO-MERGE (hard constraint, restated in every
// phase of this work): no code path here ever writes
// transporterPartnerId/contractedVehicleId onto a source record unless
// the matched partner/vehicle's own reviewStatus is already
// 'confirmed'. A same-string match against an UNCONFIRMED row still
// routes to the review queue (as a very-high-confidence, score-1.0
// candidate) rather than resolving automatically -- an unconfirmed row
// is, by definition, not yet trusted identity, so re-using it silently
// would be exactly the auto-merge this phase is designed to avoid.

import { distance } from 'fastest-levenshtein';
import { transportPartnerRepository } from '@/modules/transport-cost/repositories/transport-partner.repository';
import { contractedVehicleRepository } from '@/modules/transport-cost/repositories/contracted-vehicle.repository';
import { normalizationReviewRepository } from '@/modules/transport-cost/repositories/normalization-review.repository';
import { isKnownInvalidTransporter, detectMultiPlate } from '@/modules/transport-cost/utils/normalization.utils';
import { TransportPartner } from '@/shared/types/transport-partner.types';
import { ContractedVehicle } from '@/shared/types/contracted-vehicle.types';

/**
 * >= this similarity: the UI may pre-select the suggestion as "likely".
 * Purely a display hint -- see the header, this NEVER changes what gets
 * written. DEFAULT (not a client-confirmed threshold) -- flagged in the
 * O2 spec and the delivery README as provisional pending real-data
 * tuning against Olivine's full transporter list.
 */
export const TRANSPORTER_AUTO_SUGGEST_THRESHOLD = 0.9;

/**
 * Below this similarity, a candidate is not shown at all -- the review
 * item is filed as "possibly a new transporter" with no candidate.
 * Same DEFAULT/provisional status as the threshold above.
 */
export const TRANSPORTER_REVIEW_FLOOR = 0.75;

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance(a, b) / maxLen;
}

export type TransporterMatchOutcome = 'resolved-confirmed' | 'pending-review' | 'blocked' | 'no-value';

export interface TransporterMatchResult {
  outcome: TransporterMatchOutcome;
  /** Set only when outcome === 'resolved-confirmed'. */
  transporterPartnerId?: string;
  /** Set only when outcome === 'pending-review'. */
  reviewItemId?: string;
  candidateScore?: number;
}

export type VehicleMatchOutcome = 'resolved-confirmed' | 'pending-review' | 'no-registration';

export interface VehicleMatchResult {
  outcome: VehicleMatchOutcome;
  /** Set only when outcome === 'resolved-confirmed'. */
  contractedVehicleId?: string;
  /** Set only when outcome === 'pending-review'. */
  reviewItemId?: string;
  candidateScore?: number;
  isMultiPlate?: boolean;
}

export class NormalizationMatcherService {
  /**
   * Resolves (or queues for review) one source record's transporter
   * name. `transporterNormalized` is the value already produced by
   * normalizeTransporter() in the O1/O2 shared utils -- this service
   * does not re-normalize.
   */
  async matchTransporter(
    transporterNormalized: string | null,
    sourceRecordId: string,
    tenantId: string
  ): Promise<TransporterMatchResult> {
    if (!transporterNormalized) return { outcome: 'no-value' };

    // Defense-in-depth: O1's import handler already refuses to store a
    // row whose transporter is a known-invalid label (VAT EXCL and
    // siblings). This check exists for any OTHER caller of this
    // service -- e.g. the O2 backfill script running over rows
    // imported before this guard existed -- so a blocklisted value can
    // never reach this far and pollute the master list or the review
    // queue either.
    if (isKnownInvalidTransporter(transporterNormalized)) {
      return { outcome: 'blocked' };
    }

    const exact = await transportPartnerRepository.findByExactNameOrAlias(transporterNormalized, tenantId);
    if (exact && exact.reviewStatus === 'confirmed') {
      return { outcome: 'resolved-confirmed', transporterPartnerId: exact._id! };
    }

    // Either no exact hit, or an exact hit against a row nobody has
    // confirmed yet -- both cases need a human decision, so fall
    // through to fuzzy scoring / review-item filing. An exact-but-
    // unconfirmed hit is scored 1.0 rather than re-run through
    // fuzzy matching -- it IS the same string, that part is not in
    // question.
    let candidate: TransportPartner | null = exact;
    let candidateScore = exact ? 1 : 0;

    if (!exact) {
      const pool = await transportPartnerRepository.findAllForMatching(tenantId);
      for (const partner of pool) {
        const names = [partner.canonicalName, ...partner.aliases];
        for (const name of names) {
          const score = similarity(transporterNormalized, name);
          if (score > candidateScore) {
            candidateScore = score;
            candidate = partner;
          }
        }
      }
      if (candidateScore < TRANSPORTER_REVIEW_FLOOR) {
        candidate = null;
        candidateScore = 0;
      }
    }

    const reviewItemId = await this.fileOrAppendReviewItem(
      'transporter',
      transporterNormalized,
      sourceRecordId,
      tenantId,
      candidate ? { candidateEntityId: candidate._id!, candidateScore } : undefined
    );

    return {
      outcome: 'pending-review',
      reviewItemId,
      candidateScore: candidate ? candidateScore : undefined,
    };
  }

  /**
   * Resolves (or queues for review) one source record's registration.
   * `registrationRaw` is the UNNORMALIZED cell value (needed for
   * multi-plate detection, which relies on separators normalization
   * strips) and `registrationNormalized` is normalizeRegistration's
   * output.
   */
  async matchVehicle(
    registrationRaw: string,
    registrationNormalized: string | null,
    sourceRecordId: string,
    tenantId: string
  ): Promise<VehicleMatchResult> {
    const multiPlate = detectMultiPlate(registrationRaw);
    if (multiPlate.isMultiPlate) {
      // Decision 4 (O2 spec): ALWAYS routed to review, regardless of
      // whether the individual components would otherwise match --
      // never split, never silently resolved to one component plate.
      const rawValue = registrationNormalized ?? registrationRaw.replace(/\s+/g, '').toUpperCase();
      const reviewItemId = await this.fileOrAppendReviewItem(
        'vehicle',
        rawValue,
        sourceRecordId,
        tenantId,
        undefined,
        { isMultiPlate: true, plateComponents: multiPlate.components }
      );
      return { outcome: 'pending-review', reviewItemId, isMultiPlate: true };
    }

    if (!registrationNormalized) {
      // Blank REG cell -- a known Vansales merged-cell artifact (audit
      // Section K), not an error. Nothing to match.
      return { outcome: 'no-registration' };
    }

    const exact = await contractedVehicleRepository.findByRegistration(registrationNormalized, tenantId);
    if (exact && exact.reviewStatus === 'confirmed') {
      return { outcome: 'resolved-confirmed', contractedVehicleId: exact._id! };
    }

    // Same reasoning as the transporter path: an exact registration
    // match against an unconfirmed row is a score-1.0 candidate, not
    // an auto-resolution. Unlike transporters, there is no fuzzy
    // fallback here -- no match at all means "possibly a new vehicle",
    // filed with no candidate.
    const candidate: ContractedVehicle | null = exact;
    const candidateScore = exact ? 1 : undefined;

    const reviewItemId = await this.fileOrAppendReviewItem(
      'vehicle',
      registrationNormalized,
      sourceRecordId,
      tenantId,
      candidate ? { candidateEntityId: candidate._id!, candidateScore: candidateScore! } : undefined
    );

    return { outcome: 'pending-review', reviewItemId, candidateScore };
  }

  /**
   * Finds the existing pending review item for this exact (kind,
   * rawValue) pair and appends this source record to it, or creates a
   * new one. Centralizes the "one item per distinct raw value" rule
   * (see normalization-review.types.ts) so both matchTransporter and
   * matchVehicle share one code path for it.
   */
  private async fileOrAppendReviewItem(
    kind: 'transporter' | 'vehicle',
    rawValue: string,
    sourceRecordId: string,
    tenantId: string,
    candidate?: { candidateEntityId: string; candidateScore: number },
    multiPlate?: { isMultiPlate: true; plateComponents: string[] }
  ): Promise<string> {
    const existing = await normalizationReviewRepository.findPendingByRawValue(kind, rawValue, tenantId);
    if (existing) {
      if (!existing.sourceRecordIds.includes(sourceRecordId)) {
        await normalizationReviewRepository.appendSourceRecordId(existing._id!, sourceRecordId, tenantId);
      }
      return existing._id!;
    }

    const created = await normalizationReviewRepository.create(
      {
        kind,
        rawValue,
        status: 'pending',
        sourceRecordIds: [sourceRecordId],
        ...(candidate ? { candidateEntityId: candidate.candidateEntityId, candidateScore: candidate.candidateScore } : {}),
        ...(multiPlate ? multiPlate : {}),
      },
      tenantId
    );
    return created._id!;
  }
}

export const normalizationMatcherService = new NormalizationMatcherService();
