// infrastructure/database/indexes.outbox-addendum.ts
//
// PHASE 3 -- indexes for the transactional outbox.
//
// `tbloutbox_events` had NO index definitions anywhere in
// infrastructure/database/. That was survivable only because nothing
// ever wrote to it. Now that every domain event lands here, the
// collection is on the hot path of both publication and delivery, and
// the claim query below runs on every poll of every processor.
//
// Every index is derived from a real query in
// server/events/outbox/OutboxRepository.ts, named in its comment.

export const OUTBOX_INDEXES = {
  tbloutbox_events: [
    {
      /**
       * THE IDEMPOTENCY CONSTRAINT.
       *
       * `append()` relies on this to collapse a duplicate publish: two
       * concurrent publishers racing on the same event produce one row,
       * and the loser learns that from an 11000 rather than from a
       * read-then-write check that could interleave. Without the unique
       * index that race silently produces two rows and the event is
       * delivered twice.
       *
       * `isAlreadyProcessed()` also reads by eventId on every dispatch.
       *
       * NOT tenant-prefixed, unlike almost every other index in this
       * codebase. An eventId is a UUID generated in DomainEvent's
       * constructor, so it is globally unique by construction, and the
       * processor looks rows up cross-tenant by eventId alone -- a
       * tenant-prefixed unique index would not constrain that lookup.
       *
       * NOT partial on isDeleted: outbox rows are hard-deleted by the
       * cleanup job, never soft-deleted, so there is no deleted-row
       * collision to make room for.
       */
      key: { eventId: 1 },
      name: 'uniq_outbox_event_id',
      unique: true,
    },
    {
      /**
       * THE CLAIM QUERY. `claimBatch()` filters on status plus
       * nextAttemptAt/scheduledAt and sorts by createdAt ascending.
       *
       * Field order matters: status is the equality predicate, so it
       * leads; nextAttemptAt is the range predicate; createdAt supports
       * the sort. Without this, every poll of every processor is a
       * collection scan over a table that grows with every event the
       * platform emits.
       */
      key: { status: 1, nextAttemptAt: 1, createdAt: 1 },
      name: 'idx_outbox_status_next_created',
    },
    {
      /**
       * STALE-LEASE RECOVERY. The second branch of the claim filter
       * matches `{status: 'processing', leaseExpiresAt: {$lte: now}}` --
       * the path that rescues events from a processor that died
       * mid-dispatch.
       *
       * Its own index rather than relying on the one above, because
       * leaseExpiresAt is not a prefix of that key and the $or branches
       * are planned independently.
       */
      key: { status: 1, leaseExpiresAt: 1 },
      name: 'idx_outbox_status_lease',
    },
    {
      /**
       * CLEANUP. workers/cleanup.worker.ts deletes
       * `{processed: true, processedAt: {$lt: cutoff}}` past a 7-day
       * retention. That job predates Phase 3 and is left working
       * unchanged; this is the index it always needed.
       */
      key: { processed: 1, processedAt: 1 },
      name: 'idx_outbox_processed_at',
    },
    {
      /**
       * A tenant's dead-letter queue.
       * `getDeadLetteredForTenant()` is a SCOPED read reached from a
       * request, so unlike the processor surface it is tenant-prefixed
       * like every other tenant-scoped index in this codebase.
       */
      key: { tenantId: 1, status: 1, deadLetteredAt: -1 },
      name: 'idx_outbox_tenant_status_deadlettered',
    },
  ],
} as const;
