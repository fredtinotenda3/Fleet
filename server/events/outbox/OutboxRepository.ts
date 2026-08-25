// server/events/outbox/OutboxRepository.ts
//
// PHASE 3 -- durable storage and atomic claiming for outbox rows.
//
// ---------------------------------------------------------------------
// WHY SOME METHODS BYPASS THE TENANT-SCOPED BASE REPOSITORY
// ---------------------------------------------------------------------
// This is the one deliberate exception to the fail-closed tenant scoping
// Phase 0 established, and it is worth being precise about.
//
// The previous processor called:
//
//   this.repo.getUnprocessedEvents('default', 100)
//
// `'default'` is one of the sentinels Phase 0 turned into a hard
// TenantScopeError. So that call does not merely fetch the wrong rows --
// it THROWS on the first poll. The processor was not just unwired; it
// could not have worked if it had been.
//
// The correct model is that the processor is a PLATFORM-LEVEL job, like
// the schedulers in server/scheduler/. It must see every tenant's rows,
// because it is the delivery mechanism for all of them. Passing it a
// tenant id would be a lie in either direction: a single tenant means it
// silently stops delivering for everyone else, and a sentinel means it
// throws.
//
// So `claimBatch` and the lifecycle transitions below operate directly
// on the collection, cross-tenant, by design. THE ISOLATION GUARANTEE IS
// PRESERVED ELSEWHERE: every claimed row carries its own `tenantId`, the
// processor rehydrates the event with that tenant in its metadata, and
// handlers resolve their own scope from it exactly as they do for a live
// event. The processor moves envelopes; it never reads a tenant's domain
// data.
//
// Reads that are genuinely per-tenant -- an admin inspecting their own
// dead-letter queue -- still go through the scoped base repository.

import { BaseRepository } from '@/server/repositories/base.repository';
import { OutboxEvent, OutboxStatus } from './OutboxEvent';
import { Filter } from 'mongodb';

export interface ClaimOptions {
  batchSize: number;
  leaseTimeoutMs: number;
  leaseOwner: string;
}

export type FailureOutcome = 'retry_scheduled' | 'dead_lettered' | 'lease_lost';

export class OutboxRepository extends BaseRepository<OutboxEvent> {
  protected collectionName = 'tbloutbox_events';

  /**
   * Records an event for later delivery.
   *
   * Returns `false` when the eventId already exists -- a duplicate
   * publish, not an error. The unique index on `eventId` is what makes
   * this safe: two concurrent publishers racing on the same event
   * produce one row, and the loser learns that from the index rather
   * than from a read-then-write check that could interleave.
   */
  async append(
    event: Omit<OutboxEvent, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>
  ): Promise<boolean> {
    const collection = await this.getCollection();
    const now = new Date();

    try {
      await collection.insertOne({
        ...event,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      } as never);
      return true;
    } catch (error) {
      // 11000 = duplicate key. The event is already recorded, which is
      // precisely the outcome we want; reporting it as a failure would
      // make a caller retry a publish that already succeeded.
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  /**
   * Atomically claims up to `batchSize` deliverable rows.
   *
   * THE CONCURRENCY MECHANISM. Each row is taken with a single
   * `findOneAndUpdate` whose FILTER encodes the whole claim precondition
   * and whose UPDATE marks it processing. Mongo applies that atomically
   * per document, so two processors racing on one row produce exactly one
   * winner -- the loser's filter no longer matches and it gets `null`.
   *
   * A row is claimable when it is either:
   *   * `pending` and due (no nextAttemptAt/scheduledAt, or both passed);
   *   * `processing` with an EXPIRED lease -- the crash-recovery path. A
   *     processor that died mid-dispatch cannot strand an event forever,
   *     because its claim simply times out.
   *
   * Claiming one at a time rather than `updateMany` + read is
   * deliberate: `updateMany` cannot report WHICH documents it matched,
   * so recovering the claimed set needs a second query that can race
   * with another processor's claim on the same rows.
   */
  async claimBatch(options: ClaimOptions): Promise<OutboxEvent[]> {
    const collection = await this.getCollection();
    const claimed: OutboxEvent[] = [];

    for (let i = 0; i < options.batchSize; i += 1) {
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + options.leaseTimeoutMs);

      const filter = {
        isDeleted: { $ne: true },
        $or: [
          {
            status: 'pending',
            $and: [
              { $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }] },
              { $or: [{ scheduledAt: { $exists: false } }, { scheduledAt: { $lte: now } }] },
            ],
          },
          // Stale lease: reclaim from a processor that is not coming back.
          { status: 'processing', leaseExpiresAt: { $lte: now } },
        ],
      } as unknown as Filter<OutboxEvent>;

      const result = await collection.findOneAndUpdate(
        filter,
        {
          $set: {
            status: 'processing' as OutboxStatus,
            leaseExpiresAt,
            leaseOwner: options.leaseOwner,
            updatedAt: now,
          },
        },
        // Oldest first: an outbox is a queue, and delivering a newer
        // event before an older one for the same aggregate is how a
        // projection applies updates out of order.
        { sort: { createdAt: 1 }, returnDocument: 'after' }
      );

      if (!result) break; // Nothing left to claim.
      claimed.push(this.normalizeDoc<OutboxEvent>(result));
    }

    return claimed;
  }

  /**
   * Marks a claimed row delivered.
   *
   * Guarded on `status: 'processing'` AND on the lease owner: a
   * processor whose lease already expired and was stolen must not be
   * able to close the row, or it would close the row the second
   * processor is legitimately working on underneath it.
   */
  async markProcessed(eventId: string, leaseOwner: string): Promise<boolean> {
    const collection = await this.getCollection();
    const now = new Date();

    const result = await collection.updateOne(
      { eventId, status: 'processing', leaseOwner } as unknown as Filter<OutboxEvent>,
      {
        $set: {
          status: 'processed' as OutboxStatus,
          // Kept in step with `status` for the existing cleanup job,
          // which filters {processed: true}.
          processed: true,
          processedAt: now,
          updatedAt: now,
        },
        $unset: { leaseExpiresAt: '', leaseOwner: '' },
      }
    );

    return result.modifiedCount === 1;
  }

  /**
   * Records a failed dispatch and schedules the retry.
   *
   * Exponential backoff with a ceiling: attempt 1 waits base, attempt 2
   * waits 2x base, and so on up to backoffMax. Without it, a handler
   * failing because a downstream service is down is retried on every
   * poll -- turning one outage into a self-inflicted load test against
   * the thing already struggling.
   *
   * Past `maxAttempts` the row is DEAD-LETTERED rather than retried
   * forever. Terminal by design: a poisoned event needs a human, and
   * infinite retry only guarantees the log fills before anyone notices.
   */
  async recordFailure(
    eventId: string,
    leaseOwner: string,
    error: string,
    policy: { maxAttempts: number; backoffBaseMs: number; backoffMaxMs: number }
  ): Promise<FailureOutcome> {
    const collection = await this.getCollection();

    const current = await collection.findOne({ eventId } as unknown as Filter<OutboxEvent>);
    if (!current || current.status !== 'processing' || current.leaseOwner !== leaseOwner) {
      return 'lease_lost';
    }

    const attempts = (current.attempts ?? 0) + 1;
    const now = new Date();
    // Truncated to keep a stack trace or a vendor HTML error page out of
    // the row. The processor sanitises before calling here.
    const lastError = error.slice(0, 500);

    if (attempts >= policy.maxAttempts) {
      await collection.updateOne({ eventId } as unknown as Filter<OutboxEvent>, {
        $set: {
          status: 'dead_letter' as OutboxStatus,
          attempts,
          lastError,
          deadLetteredAt: now,
          updatedAt: now,
        },
        $unset: { leaseExpiresAt: '', leaseOwner: '' },
      });
      return 'dead_lettered';
    }

    const delay = Math.min(
      policy.backoffBaseMs * Math.pow(2, attempts - 1),
      policy.backoffMaxMs
    );

    await collection.updateOne({ eventId } as unknown as Filter<OutboxEvent>, {
      $set: {
        status: 'pending' as OutboxStatus,
        attempts,
        lastError,
        nextAttemptAt: new Date(now.getTime() + delay),
        updatedAt: now,
      },
      $unset: { leaseExpiresAt: '', leaseOwner: '' },
    });

    return 'retry_scheduled';
  }

  /** Whether this event has already been delivered. The idempotency check. */
  async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const collection = await this.getCollection();
    const row = await collection.findOne(
      { eventId, status: 'processed' } as unknown as Filter<OutboxEvent>,
      { projection: { _id: 1 } }
    );
    return row !== null;
  }

  /**
   * Counts by status, for health checks and operator dashboards.
   *
   * Cross-tenant like the rest of the processor surface: "how many
   * events are stuck" is a platform question.
   */
  async countByStatus(): Promise<Record<OutboxStatus, number>> {
    const collection = await this.getCollection();
    const rows = await collection
      .aggregate<{ _id: OutboxStatus; count: number }>([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray();

    const counts: Record<OutboxStatus, number> = {
      pending: 0,
      processing: 0,
      processed: 0,
      dead_letter: 0,
    };
    for (const row of rows) {
      if (row._id in counts) counts[row._id] = row.count;
    }
    return counts;
  }

  /**
   * A tenant's dead-lettered events.
   *
   * Goes through the TENANT-SCOPED base repository, unlike the processor
   * surface above: this one is reached from a request on behalf of a
   * user, so it is scoped like any other read.
   */
  async getDeadLetteredForTenant(tenantId: string, limit = 100): Promise<OutboxEvent[]> {
    return this.findMany({ status: 'dead_letter' } as unknown as Filter<OutboxEvent>, tenantId, {
      limit,
      sortBy: 'deadLetteredAt',
      sortOrder: 'desc',
    });
  }

  /**
   * Returns a dead-lettered row to the queue after a human has looked at
   * it. Explicitly operator-driven -- nothing automatic resurrects a
   * dead letter, because a duplicate side effect appearing months later
   * with no human in the loop is worse than an undelivered event.
   */
  async requeueDeadLetter(eventId: string, tenantId: string): Promise<boolean> {
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      { eventId, tenantId, status: 'dead_letter' } as unknown as Filter<OutboxEvent>,
      {
        $set: { status: 'pending' as OutboxStatus, attempts: 0, updatedAt: new Date() },
        $unset: { deadLetteredAt: '', nextAttemptAt: '', lastError: '' },
      }
    );
    return result.modifiedCount === 1;
  }
}

export const outboxRepository = new OutboxRepository();
