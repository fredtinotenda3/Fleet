// server/events/outbox/OutboxProcessor.ts
//
// PHASE 3 -- the only component that dispatches durable events.
//
// ---------------------------------------------------------------------
// WHAT THIS REPLACES
// ---------------------------------------------------------------------
// The previous processor had four defects, any one of which was fatal:
//
//   1. `getUnprocessedEvents('default', 100)` -- `'default'` is a
//      Phase 0 fail-closed sentinel, so the first poll THREW. It could
//      not have worked even if it had been wired in.
//   2. No claim. Two instances read the same unprocessed rows and both
//      dispatched them.
//   3. No backoff. A failing row was retried on every poll, forever --
//      one downstream outage became a self-inflicted load test.
//   4. No terminal state. A poisoned event was retried until the end of
//      time.
//
// ---------------------------------------------------------------------
// DELIVERY GUARANTEE: AT-LEAST-ONCE
// ---------------------------------------------------------------------
// Honestly at-least-once, not exactly-once, and the gap is precise:
// dispatch and the subsequent `markProcessed` are two operations against
// two systems. A processor that crashes in between has run the handlers
// and not recorded it, so the row's lease expires and another processor
// redelivers.
//
// `isAlreadyProcessed` narrows that window but cannot close it -- it is
// checked BEFORE dispatch, so it catches redelivery of a row that was
// fully completed, not a crash mid-dispatch. Closing it entirely would
// need the handler's write and the row update in one transaction, which
// means every handler participating in a Mongo session it currently
// knows nothing about. That is a larger change than Phase 3, and
// pretending otherwise by labelling this exactly-once would be worse
// than stating the limit.
//
// Handlers must therefore tolerate being called twice. See
// docs/EVENT_DURABILITY.md for which ones do, and which are documented
// exceptions.

import { OutboxRepository, outboxRepository } from './OutboxRepository';
import { OutboxEvent } from './OutboxEvent';
import { StoredDomainEvent } from './StoredDomainEvent';
import { IEventPublisher } from '../base/IEventPublisher';
import { OutboxConfig, getOutboxConfig } from './outbox.config';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { randomUUID } from 'crypto';

export interface ProcessBatchResult {
  claimed: number;
  processed: number;
  retryScheduled: number;
  deadLettered: number;
  skippedDuplicate: number;
}

export class OutboxProcessor {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  /**
   * Identifies this processor instance for lease ownership.
   *
   * Per-instance, not per-host: two processors in one container must not
   * be able to close each other's claims. Diagnostic in logs, and
   * load-bearing in `markProcessed`/`recordFailure`, which refuse to act
   * on a row whose lease has been stolen.
   */
  private readonly leaseOwner = `outbox-${process.pid}-${randomUUID().slice(0, 8)}`;

  constructor(
    /**
     * Where dispatch goes.
     *
     * Injected rather than pulled from EventBusFactory, which is what
     * made the old code un-enableable: the factory now returns the
     * OUTBOX bus in outbox mode, so a processor that asked the factory
     * for its dispatch target would write events straight back into the
     * outbox it is draining -- an infinite loop that grows a collection.
     * The processor must always dispatch to the IN-MEMORY bus.
     */
    private readonly dispatcher: IEventPublisher,
    private readonly repo: OutboxRepository = outboxRepository,
    private readonly config: OutboxConfig = getOutboxConfig()
  ) {}

  /** Whether the poll loop is currently running. */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Starts the poll loop.
   *
   * Uses a self-rescheduling timeout rather than setInterval: an
   * interval fires on a fixed schedule regardless of how long the
   * previous run took, so a batch slower than the interval would
   * overlap with itself and two concurrent passes of the same process
   * would race for the same rows.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    monitoring.logInfo('[outbox] Processor started', {
      leaseOwner: this.leaseOwner,
      intervalMs: this.config.intervalMs,
    });

    const tick = async () => {
      if (!this.isRunning) return;
      try {
        await this.processBatch();
      } catch (error) {
        // A poll failure must not kill the loop -- Mongo being briefly
        // unavailable should degrade throughput, not stop delivery
        // permanently.
        monitoring.logError('[outbox] Processor batch failed', error as Error, {
          leaseOwner: this.leaseOwner,
        });
      }
      if (this.isRunning) {
        this.timer = setTimeout(tick, this.config.intervalMs);
        // Do not hold the event loop open on this timer alone: a worker
        // shutting down should exit rather than wait out a poll.
        this.timer.unref?.();
      }
    };

    void tick();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    monitoring.logInfo('[outbox] Processor stopped', { leaseOwner: this.leaseOwner });
  }

  /**
   * Claims and dispatches one batch. Exposed so `npm run events:process`
   * can drain once and exit, and so tests can drive it deterministically
   * without a timer.
   */
  async processBatch(): Promise<ProcessBatchResult> {
    const result: ProcessBatchResult = {
      claimed: 0,
      processed: 0,
      retryScheduled: 0,
      deadLettered: 0,
      skippedDuplicate: 0,
    };

    const claimed = await this.repo.claimBatch({
      batchSize: this.config.batchSize,
      leaseTimeoutMs: this.config.leaseTimeoutMs,
      leaseOwner: this.leaseOwner,
    });

    result.claimed = claimed.length;
    if (claimed.length === 0) return result;

    for (const row of claimed) {
      const outcome = await this.dispatchOne(row);
      switch (outcome) {
        case 'processed':
          result.processed += 1;
          break;
        case 'duplicate':
          result.skippedDuplicate += 1;
          break;
        case 'retry_scheduled':
          result.retryScheduled += 1;
          break;
        case 'dead_lettered':
          result.deadLettered += 1;
          break;
      }
    }

    return result;
  }

  private async dispatchOne(
    row: OutboxEvent
  ): Promise<'processed' | 'duplicate' | 'retry_scheduled' | 'dead_lettered' | 'lease_lost'> {
    /**
     * IDEMPOTENCY GATE.
     *
     * A row can be reclaimed after a lease expiry even though its
     * handlers already ran (crash between dispatch and markProcessed).
     * Checking `processed` on the eventId before dispatching turns the
     * common redelivery case into a no-op.
     *
     * This does NOT make delivery exactly-once -- see the header. It
     * closes the window where the row is known-complete, not the window
     * where a crash happened mid-dispatch.
     */
    if (await this.repo.isAlreadyProcessed(row.eventId)) {
      monitoring.logDebug('[outbox] Skipping already-processed event', {
        eventId: row.eventId,
        eventName: row.eventName,
      });
      return 'duplicate';
    }

    try {
      // Rehydrated with its ORIGINAL eventId and occurredOn, so handlers
      // see the event as it happened rather than as it was replayed.
      const event = new StoredDomainEvent(row);

      /**
       * Prefers `publishOrThrow` where the dispatcher offers it.
       *
       * InMemoryEventBus.publish() never rejects by design -- it is
       * called fire-and-forget after a DB write, where a throw would
       * report a successful operation as failed. Dispatching through it
       * here would swallow every handler failure, so the processor would
       * mark failed events processed and retry/dead-letter could never
       * fire. Duck-typed rather than widening IEventPublisher, so a
       * dispatcher that simply throws from publish() (a test double, a
       * future transport) still works unchanged.
       */
      const dispatcher = this.dispatcher as IEventPublisher & {
        publishOrThrow?: (e: StoredDomainEvent) => Promise<void>;
      };

      if (typeof dispatcher.publishOrThrow === 'function') {
        await dispatcher.publishOrThrow(event);
      } else {
        await dispatcher.publish(event);
      }

      const closed = await this.repo.markProcessed(row.eventId, this.leaseOwner);
      if (!closed) {
        // Our lease was stolen while we worked -- the row belongs to
        // another processor now. Reported rather than retried here: the
        // new owner will finish it, and forcing the row closed would
        // close work we no longer own.
        monitoring.logWarn('[outbox] Lease lost before completion', {
          eventId: row.eventId,
          eventName: row.eventName,
        });
        return 'lease_lost';
      }

      return 'processed';
    } catch (error) {
      /**
       * Sanitised BEFORE it reaches storage or logs.
       *
       * A handler failure can carry a vendor response body, a query, or
       * a stack trace containing payload values. The outbox row is a
       * long-lived record read by operators, so only the message --
       * truncated -- is retained. The payload itself is never logged
       * here, per the Phase 3 requirement and the same redaction
       * discipline Phase 0 applied to provider errors.
       */
      const message = error instanceof Error ? error.message : String(error);

      const outcome = await this.repo.recordFailure(
        row.eventId,
        this.leaseOwner,
        message,
        {
          maxAttempts: this.config.maxAttempts,
          backoffBaseMs: this.config.backoffBaseMs,
          backoffMaxMs: this.config.backoffMaxMs,
        }
      );

      if (outcome === 'dead_lettered') {
        monitoring.logError(
          '[outbox] Event dead-lettered after repeated failures',
          error as Error,
          {
            eventId: row.eventId,
            eventName: row.eventName,
            tenantId: row.tenantId,
            attempts: this.config.maxAttempts,
          }
        );
      } else if (outcome === 'retry_scheduled') {
        monitoring.logWarn('[outbox] Dispatch failed; retry scheduled', {
          eventId: row.eventId,
          eventName: row.eventName,
          attempts: (row.attempts ?? 0) + 1,
        });
      }

      return outcome;
    }
  }
}
