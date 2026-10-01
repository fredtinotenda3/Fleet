// modules/attention/types/attention-outcome-addendum.ts
//
// MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
// Verification", the one link in the requested
// REAL-WORLD OPERATION → EVIDENCE → OPERATIONAL TRUTH → INTELLIGENCE →
// ATTENTION → DECISION → ACTION → OUTCOME → FINANCIAL TRUTH
// journey that did not already exist anywhere in this codebase under
// any name (confirmed by a case-insensitive sweep of modules/attention
// and modules/workflows for "outcome"/"resolution confirmed"/"verified
// resolved" before writing this file).
//
// ---------------------------------------------------------------------
// WHY THIS IS A HUMAN CONFIRMATION, NOT AN AUTOMATIC RE-CHECK
// ---------------------------------------------------------------------
// The obvious-looking alternative -- re-run the source AI service after
// resolution and see if it still fires -- was deliberately rejected:
//
//   1. attention-item.types.ts's own header already documents that
//      getFeed()'s upsert NEVER flips a resolved item back to 'open'
//      when its source re-detects the same condition, specifically so
//      a resolved item does not silently flip-flop on polling lag or a
//      slow-to-propagate fix. An automatic outcome check would either
//      duplicate that same flip-flop risk or have to re-implement the
//      same debounce logic a second time.
//   2. needs-attention.service.ts fans out over five AI services plus
//      compliance and maintenance, carries `maxDuration = 60`, and has
//      already caused one production timeout incident (see
//      useSetupProgress.ts's COST CONTROL note, which deliberately
//      avoids calling it for exactly this reason). Triggering that
//      same sweep synchronously inside a one-item verification request
//      would risk reproducing the same incident for a much smaller
//      feature.
//
// A person who checked and can point at what they checked
// (`evidenceRefs`, the same convention attention-resolution.service.ts
// already uses for ledger-eligible resolutions) is more honest than a
// cheap automatic re-check that might only prove the detector hasn't
// re-polled yet -- consistent with this codebase's "failure is an
// answer, not a fabrication" discipline applied to automation itself.
//
// Additive module augmentation, same pattern as
// trip.map-assisted-addendum.ts: attention-item.types.ts is untouched,
// every field is optional, and every existing persisted AttentionItem
// (which has none of these fields) remains valid.

import '@/modules/attention/types/attention-item.types';

export type AttentionOutcomeStatus = 'unverified' | 'verified_resolved' | 'reopened';

declare module '@/modules/attention/types/attention-item.types' {
  interface AttentionItem {
    /**
     * Whether a person has checked, AFTER resolution, that the
     * underlying problem is actually gone. Absent/`'unverified'` for
     * every item that has only ever been resolved, never verified --
     * the overwhelming majority today, and that is an honest gap, not
     * a defect: this is a new capability, not a backfilled guarantee.
     */
    outcomeStatus?: AttentionOutcomeStatus;
    outcomeVerifiedAt?: Date | null;
    outcomeVerifiedBy?: string | null;
    /** What the verifier actually checked, in their own words. Required by the service when outcomeStatus is 'reopened' -- see attention-resolution.service.ts. */
    outcomeNote?: string;
  }
}
