// server/events/outbox/OutboxEvent.ts
//
// PHASE 3 -- the durable record of one domain event.
//
// ---------------------------------------------------------------------
// WHAT THIS SHAPE GAINED, AND WHY
// ---------------------------------------------------------------------
// The original row carried `processed: boolean`, `attempts`, `lastError`
// and `scheduledAt`. That is enough to record an event and not enough to
// deliver one reliably:
//
//   * no CLAIM, so two processor instances both read the same
//     unprocessed row and both dispatch it;
//   * no LEASE, so a processor that crashes mid-dispatch leaves the row
//     looking available to nobody or to everybody, depending on how you
//     read `processed: false`;
//   * no NEXT-ATTEMPT time, so a failing row is retried on every single
//     poll -- a handler failing because a downstream service is down
//     gets hammered every 5 seconds forever;
//   * no TERMINAL state, so a permanently-poisoned event is retried
//     until the end of time and blocks nothing but wastes everything.
//
// `status` is the addition that makes the rest work. `processed` is
// RETAINED as a derived boolean purely so the existing cleanup job
// (`workers/cleanup.worker.ts`, which purges `{processed: true}` past a
// retention cutoff) keeps working unchanged -- Phase 3 adds fields, it
// does not break a working job.

import { BaseEntity } from '@/shared/types/common.types';

/**
 * Lifecycle of an outbox row.
 *
 *   pending     -> awaiting dispatch (immediately, or at nextAttemptAt)
 *   processing  -> claimed by a processor; lease held until leaseExpiresAt
 *   processed   -> delivered successfully; terminal
 *   dead_letter -> exceeded maxAttempts; terminal, needs a human
 *
 * A row moves pending -> processing -> (processed | pending | dead_letter).
 * It never moves out of processed or dead_letter automatically: both are
 * terminal by design, because silently resurrecting a row a human has
 * not looked at is how a duplicate side effect appears months later.
 */
export type OutboxStatus = 'pending' | 'processing' | 'processed' | 'dead_letter';

export interface OutboxEvent extends BaseEntity {
  /**
   * The domain event's own id, generated at construction
   * (DomainEvent.eventId). Carries a UNIQUE index.
   *
   * This is the idempotency key. It survives republication, retry and
   * process restart, so a handler asked "have I already seen this?" has
   * a stable answer that does not depend on the row's _id or its
   * position in a queue.
   */
  eventId: string;
  eventName: string;
  payload: Record<string, unknown>;
  /**
   * Event metadata, including `tenantId` where the publisher set one.
   *
   * Preserved verbatim so the processor can rehydrate an event that is
   * indistinguishable from the original -- including its tenant context,
   * which is what keeps dispatch inside the right tenant.
   */
  metadata?: Record<string, unknown>;

  status: OutboxStatus;

  /**
   * Derived from `status === 'processed'`.
   *
   * RETAINED FOR COMPATIBILITY, not as the source of truth. The cleanup
   * worker filters `{processed: true, processedAt: {$lt: cutoff}}`;
   * changing that query is out of scope for Phase 3 and the field costs
   * nothing to maintain. Always written together with `status`.
   */
  processed: boolean;
  processedAt?: Date;

  /** How many dispatch attempts have been made. */
  attempts: number;
  /** Message from the most recent failure. Never a payload dump. */
  lastError?: string;

  /**
   * Earliest time this row may be claimed again.
   *
   * Set on every failure via exponential backoff. `pending` rows with a
   * future nextAttemptAt are invisible to the claim query, which is what
   * turns "retry" into "retry later" rather than "retry immediately,
   * forever".
   */
  nextAttemptAt?: Date;

  /**
   * When the current claim expires.
   *
   * A `processing` row whose lease has passed is reclaimable. This is
   * the crash-recovery mechanism: a processor that dies mid-dispatch
   * cannot permanently strand an event, because its claim simply times
   * out and another processor picks the row up.
   */
  leaseExpiresAt?: Date;
  /** Which processor holds the claim. Diagnostic only; never trusted for correctness. */
  leaseOwner?: string;

  /** When the row was given up on. Terminal marker alongside status. */
  deadLetteredAt?: Date;

  /**
   * Optional delay requested by the publisher.
   *
   * Distinct from nextAttemptAt: `scheduledAt` is intent ("do not
   * deliver before this"), nextAttemptAt is consequence ("a failure
   * pushed this out"). Kept separate so a backoff cannot silently erase
   * a publisher's scheduling intent.
   */
  scheduledAt?: Date;
}
