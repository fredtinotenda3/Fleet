// modules/transport-cost/services/transport-cost-lifecycle.service.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. See
// OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md Section 8.1 for the full
// design record this implements -- this file is what that section
// describes, not a separate design.
//
// CENTRAL DECISION: a TransportCostSourceRecord's operational lifecycle
// state is DERIVED, never stored. `TransportCostSourceRecord` gained
// exactly three new fields this slice (cancelledAt/cancelledBy/
// cancelReason -- see that type's own doc comment) because "cancelled"
// is the one fact nothing else already captures. Every other state
// (needs-review / ready-to-post / posted / reversed) is computed here
// from data that already exists and is already the source of truth for
// it: the O2 NormalizationReviewItem queue, and the O3 Allocation
// Ledger's own posting history (via AllocationLedgerRepository
// .findBySource(), exactly what TransportCostPostingService already
// uses to decide "is this posted, and by how much"). A stored status
// enum here would be redundant with, and could silently drift from,
// that ledger truth -- the same reasoning this codebase already applied
// when it chose `active: boolean` over a second `isDeleted`-shaped flag
// for Customer/Destination (Slice 3), and when it chose to never add an
// `isPosted` flag to this same record type in Phase O3.
//
// Client's brief named seven candidate states (DRAFT, NEEDS_REVIEW,
// READY_TO_POST, POSTED, CORRECTION_REQUIRED, REVERSED, CANCELLED) and
// explicitly instructed "only implement states the actual workflow
// supports." DRAFT and CORRECTION_REQUIRED are NOT implemented --
// nothing in this codebase creates a record in an unsaved/draft
// condition (both bulk import and manual entry persist immediately),
// and nothing detects or flags a "needs correction" condition
// automatically (no anomaly detector exists). Inventing either now
// would be exactly the "speculative complexity" this same gap-analysis
// document has declined to build ahead of evidence in every prior
// slice. See the gap-analysis doc's Section 8.1 table for the five
// states that ARE implemented and why each is evidenced.

import type { TransportCostSourceRecord } from '@/shared/types/transport-cost.types';
import type { AllocationPosting } from '@/modules/finance/types/allocation.types';

export type OperationalStatus =
  | 'needs-review'
  | 'ready-to-post'
  | 'posted'
  | 'reversed'
  | 'cancelled';

export interface OperationalStatusResult {
  status: OperationalStatus;
  /** The current live (non-reversed, most recent) posting for this
   *  source record, if any exists in its posting history at all. */
  livePosting: AllocationPosting | null;
  /** Full posting history for this source record, oldest first, exactly
   *  as AllocationLedgerRepository.findBySource returns it -- original
   *  postings and their reversals interleaved by insertion order. Never
   *  filtered or summarized here; callers needing "current/original/
   *  reversal/net" read this array directly (see the detail-view query). */
  postingHistory: AllocationPosting[];
}

/**
 * Pure function -- no I/O. Callers gather the two signals (pending
 * review item / posting history) via their own repository calls first,
 * so this stays trivially unit-testable and reusable from a query
 * handler, a command handler, and a frontend-facing serializer alike
 * without each re-implementing the state logic.
 */
export function deriveOperationalStatus(
  source: Pick<TransportCostSourceRecord, 'cancelledAt'>,
  hasPendingReview: boolean,
  postingHistory: AllocationPosting[]
): OperationalStatusResult {
  // findBySource returns EVERY posting for this source (originals and
  // reversals) in insertion order. The "live" posting is the most
  // recent ORIGINAL (no reversalOfPostingId) that has not itself been
  // reversed by a later entry -- exactly TransportCostPostingService's
  // own `originals`/`live` derivation, duplicated here deliberately (a
  // pure, five-line read of an array the caller already has) rather
  // than imported from that service, since importing it would pull in
  // that service's full posting/reversal side effects for a read-only
  // status check. If this derivation and postSourceRecord's own ever
  // disagree, that is a bug in one of them -- see this module's parity
  // test, which asserts they always compute the same "live posting" for
  // the same history.
  const originals = postingHistory.filter((p) => !p.reversalOfPostingId);
  const reversedOriginalIds = new Set(
    postingHistory.filter((p) => p.reversalOfPostingId).map((p) => p.reversalOfPostingId as string)
  );
  const liveOriginal = [...originals].reverse().find((p) => !reversedOriginalIds.has(String(p._id)));

  // Posting history is checked BEFORE `cancelledAt`, deliberately: the
  // Cancel command's own posted-record branch (8.2) reverses first and
  // THEN sets cancelledAt, so a record can carry both a full reversed
  // posting history and a set cancelledAt at once. That combination
  // must read as 'reversed' (financially material history exists), not
  // 'cancelled' (implies it never posted) -- collapsing the two would
  // hide that history behind a label that reads as if nothing had
  // happened. `cancelledAt` only produces the 'cancelled' status for a
  // record that has NO posting history at all -- see the gap-analysis
  // doc's Section 8.1 state table for this exact distinction.
  if (liveOriginal) {
    return { status: 'posted', livePosting: liveOriginal, postingHistory };
  }
  if (originals.length > 0) {
    return { status: 'reversed', livePosting: null, postingHistory };
  }
  if (source.cancelledAt) {
    return { status: 'cancelled', livePosting: null, postingHistory };
  }
  if (hasPendingReview) {
    return { status: 'needs-review', livePosting: null, postingHistory };
  }
  return { status: 'ready-to-post', livePosting: null, postingHistory };
}

/**
 * The fields TransportCostPostingService.resolveAmountAndPeriod actually
 * reads to compute what gets posted -- see that method, unmodified by
 * this slice. Kept as ONE list, generated to match that method's real
 * inputs rather than a separately-maintained guess, so a future change
 * to resolveAmountAndPeriod's inputs is a visible diff here too (see
 * this module's own parity test asserting every key resolveAmountAndPeriod
 * reads is present in this list).
 *
 * `contractedVehicleId`/`transporterPartnerId` are included even though
 * resolveAmountAndPeriod itself does not read them (postSourceRecord's
 * caller, one level up, does -- see its own `unresolved-vehicle-identity`
 * check) -- an identity change is exactly as financially material as an
 * amount change: it changes WHICH vehicle/transporter the posted cost is
 * attributed to, which is a correction, not a cosmetic edit.
 */
export const FINANCIAL_SOURCE_RECORD_FIELDS = [
  'amount',
  'date',
  'costFacingCompany',
  'contractedVehicleId',
  'transporterPartnerId',
  'vansales',
] as const;

export type FinancialSourceRecordField = (typeof FINANCIAL_SOURCE_RECORD_FIELDS)[number];

/**
 * True iff `patch` touches at least one financially-material field (see
 * the list above). `vansales` is checked as a whole nested-object key
 * (a patch either replaces the whole `vansales` sub-object or it
 * doesn't -- this codebase never patches a single nested field in
 * isolation for this record, see edit-source-record.handler.ts) rather
 * than descending into `vansales.total`/`vansales.periodMonth`
 * specifically; a patch that touches `vansales` at all is treated as
 * financial, which is the safe direction to round on ambiguity.
 */
export function patchTouchesFinancialField(patch: Record<string, unknown>): boolean {
  return FINANCIAL_SOURCE_RECORD_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(patch, field));
}

/**
 * The fields Slice 5's Edit command may change directly on a POSTED
 * record with no ledger consequence -- pure attribution/descriptive
 * fields that resolveAmountAndPeriod/postSourceRecord never read at
 * all. Deliberately NOT the complement of FINANCIAL_SOURCE_RECORD_FIELDS
 * (there are fields, like `rawRow`/`importBatchId`/provenance fields,
 * that are neither financial nor meant to ever be human-edited at all --
 * they are excluded from both lists, and EditSourceRecordCommand rejects
 * any patch key outside this allow-list for a posted record, fail-closed
 * rather than fail-open on an unrecognized field).
 */
export const NON_FINANCIAL_EDITABLE_FIELDS = [
  'customerName',
  'destinationTown',
  'salesInvoiceNo',
  'tonnageRaw',
  'lines',
] as const;

export type NonFinancialEditableField = (typeof NON_FINANCIAL_EDITABLE_FIELDS)[number];

export function patchOnlyTouchesNonFinancialFields(patch: Record<string, unknown>): boolean {
  const keys = Object.keys(patch);
  if (keys.length === 0) return true;
  return keys.every((key) => (NON_FINANCIAL_EDITABLE_FIELDS as readonly string[]).includes(key));
}
