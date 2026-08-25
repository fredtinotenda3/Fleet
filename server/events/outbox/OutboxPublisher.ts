// server/events/outbox/OutboxPublisher.ts
//
// PHASE 3 -- durable publication.
//
// ---------------------------------------------------------------------
// THE BUG THAT MADE THIS UNWIRABLE
// ---------------------------------------------------------------------
// The previous implementation held:
//
//   private bus = EventBusFactory.getInstance();
//
//   async publish(event) {
//     await this.storeEvent(event);
//     await this.bus.publish(event);   // <-- in-memory dispatch too
//   }
//
// That is a construction-time call to the very factory that Phase 3 is
// asked to make return this class. Wiring the outbox in would have made
// `getInstance()` construct an OutboxPublisher, whose field initialiser
// calls `getInstance()`, which constructs an OutboxPublisher... The
// outbox could not be enabled without a stack overflow at first
// publish. The dead code was not merely unused; it was un-enableable.
//
// Fixed structurally: this class no longer references the factory at
// all. It writes to the outbox and returns. Composition with an
// in-memory bus for `subscribe`/`use` happens one level up, in
// OutboxEventBus.
//
// ---------------------------------------------------------------------
// DELIVERY STRATEGY: WRITE-ONLY. NO IMMEDIATE IN-MEMORY DISPATCH.
// ---------------------------------------------------------------------
// The brief offers a choice; this is the choice and the reasoning.
//
// The old code did BOTH -- wrote the row and dispatched in-process. That
// is the worst of the options, because once the processor is running it
// will pick up the same row and dispatch again. Every handler with a
// side effect fires twice for every event: two notifications, two
// webhook deliveries, two projection writes. The duplicate is not a rare
// race; it is the steady state.
//
// So publication writes the row and nothing else. All dispatch happens
// in OutboxProcessor, which is the only component that knows whether an
// event has already been delivered. One dispatcher, one place to reason
// about delivery, exactly-once side effects wherever handlers are
// idempotent and at-least-once where they are not.
//
// THE COST, STATED PLAINLY: handlers no longer run synchronously with
// the request that triggered them. A caller that (incorrectly) depended
// on a handler having completed by the time `publish()` resolved will
// now observe that work happening up to one poll interval later. That is
// a real behavioural change and it is why outbox mode is opt-in per
// environment rather than switched on globally.

import { IEventPublisher } from '../base/IEventPublisher';
import { DomainEvent } from '../base/DomainEvent';
import { OutboxRepository, outboxRepository } from './OutboxRepository';
import { OutboxEvent } from './OutboxEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';

export class OutboxPublisher implements IEventPublisher {
  constructor(private readonly repo: OutboxRepository = outboxRepository) {}

  /**
   * Durably records an event. Returns only after the write succeeds.
   *
   * A failed write THROWS. It does not fall back to in-memory delivery
   * and does not swallow the error: the caller asked for a durable
   * publish, and quietly downgrading to best-effort is precisely the
   * silent data loss Phase 3 exists to remove. The caller's transaction
   * should fail with it.
   */
  async publish(event: DomainEvent): Promise<void> {
    const tenantId = this.resolveTenantId(event);

    const row: Omit<OutboxEvent, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'> = {
      tenantId,
      eventId: event.eventId,
      eventName: event.eventName,
      payload: event.payload,
      metadata: event.metadata,
      status: 'pending',
      processed: false,
      attempts: 0,
    };

    const inserted = await this.repo.append(row);

    if (!inserted) {
      // Duplicate eventId: already recorded. Not an error -- a retried
      // publish of the same event is exactly what the unique index is
      // there to collapse.
      monitoring.logDebug('[outbox] Event already recorded; publish is a no-op', {
        eventId: event.eventId,
        eventName: event.eventName,
      });
    }
  }

  /**
   * Tenant for the outbox row, taken from event metadata.
   *
   * Falls back to `'system'` for genuinely platform-level events (a
   * scheduler heartbeat, a cross-tenant security signal) that carry no
   * tenant.
   *
   * NOTE the deliberate difference from the previous code, which used
   * `'default'`. Phase 0 turned `'default'` into a fail-closed sentinel
   * that raises TenantScopeError, so every scoped read of these rows
   * would have thrown. `'system'` is used here only as a STORAGE label
   * on a row the processor reads cross-tenant; it is never used to scope
   * a domain query, and handlers still resolve their own scope from the
   * event's own metadata.
   */
  private resolveTenantId(event: DomainEvent): string {
    const fromMetadata = event.metadata?.tenantId;
    if (typeof fromMetadata === 'string' && fromMetadata.trim()) return fromMetadata;
    return 'system';
  }
}

export const outboxPublisher = new OutboxPublisher();
