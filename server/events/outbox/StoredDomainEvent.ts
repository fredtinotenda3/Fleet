// server/events/outbox/StoredDomainEvent.ts
//
// PHASE 3 -- rehydrating a stored row back into a DomainEvent.
//
// ---------------------------------------------------------------------
// WHAT THIS REPLACES
// ---------------------------------------------------------------------
// The previous processor rebuilt events with an anonymous class
// expression and two casts through `any`:
//
//   const event = new (class extends DomainEvent {
//     constructor() {
//       super(outboxEvent.eventName, outboxEvent.payload, outboxEvent.metadata);
//       (this as any).eventId = outboxEvent.eventId;
//       (this as any).occurredOn = new Date(outboxEvent.createdAt!);
//     }
//   })();
//
// It worked, but it wrote through two `readonly` fields by casting them
// away -- so the compiler could not see that the reconstructed event's
// identity differed from the one `DomainEvent`'s constructor had just
// generated. A named class with an explicit constructor states the same
// intent without lying to the type system, and puts the reason for the
// override in one place.
//
// ---------------------------------------------------------------------
// WHY IDENTITY MUST BE PRESERVED EXACTLY
// ---------------------------------------------------------------------
// `DomainEvent`'s constructor calls `randomUUID()` and `new Date()`. A
// naive rehydration therefore produces an event with a NEW eventId and a
// NEW occurredOn -- which would break both properties the outbox exists
// to provide:
//
//   * IDEMPOTENCY. eventId is the deduplication key. A fresh id on every
//     retry means a handler asked "have I seen this?" always answers no,
//     and at-least-once delivery becomes at-least-once *side effects*.
//   * CAUSALITY. occurredOn is when the event HAPPENED, not when it was
//     delivered. A handler computing an interval from it would measure
//     queue latency instead of domain time -- and after a long outage,
//     replayed events would all appear to have occurred at replay time.

import { DomainEvent } from '../base/DomainEvent';
import { OutboxEvent } from './OutboxEvent';

/**
 * A DomainEvent reconstructed from a durable outbox row.
 *
 * Indistinguishable from the original to a handler: same eventId, same
 * name, same payload, same metadata, same occurrence time.
 */
export class StoredDomainEvent extends DomainEvent {
  constructor(row: Pick<OutboxEvent, 'eventId' | 'eventName' | 'payload' | 'metadata' | 'createdAt'>) {
    super(row.eventName, row.payload, row.metadata);

    // The base constructor has just assigned a fresh id and timestamp.
    // Both are `readonly`, which is right for normal construction and
    // wrong for rehydration -- this is the one place that legitimately
    // restores persisted identity, so the override is confined here
    // rather than repeated at every call site.
    (this as { eventId: string }).eventId = row.eventId;
    (this as { occurredOn: Date }).occurredOn = row.createdAt
      ? new Date(row.createdAt)
      : this.occurredOn;
  }
}
