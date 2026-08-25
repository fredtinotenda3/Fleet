// server/events/bus/EventBusFactory.ts
//
// PHASE 3 -- the factory now returns a DURABLE bus when configured to.
//
// ---------------------------------------------------------------------
// WHAT THIS REPLACED
// ---------------------------------------------------------------------
//   static getInstance(): IEventBus {
//     if (!instance) instance = new InMemoryEventBus();
//     return instance;
//   }
//
// Unconditional. No environment branch, no configuration, no way to get
// anything else. Every event in the system -- telemetry ingestion,
// workflow triggers, AI predictions, digital-twin projections, audit
// records, webhook dispatch -- was delivered in-process and best-effort,
// and lost on crash, redeploy or serverless instance recycle. The
// transactional outbox next door was complete, dead, and (see
// OutboxPublisher) un-enableable without a stack overflow.
//
// ---------------------------------------------------------------------
// FAIL CLOSED
// ---------------------------------------------------------------------
// Configuration is resolved by `getOutboxConfig()`, which THROWS on an
// invalid or self-contradictory setup rather than falling back. That
// exception is deliberately allowed to propagate: a process that cannot
// describe its own delivery guarantees should not start.
//
// In particular there is NO catch here that degrades to
// `InMemoryEventBus` when outbox mode is misconfigured. Silently
// downgrading durable delivery to best-effort delivery, in production,
// on a bad env var, is exactly the failure Phase 3 removes.

import { IEventBus } from './IEventBus';
import { InMemoryEventBus } from './InMemoryEventBus';
import { getOutboxConfig } from '../outbox/outbox.config';
import type { OutboxEventBus as OutboxEventBusType } from '../outbox/OutboxEventBus';

let instance: IEventBus | null = null;

export class EventBusFactory {
  /**
   * The process-wide event bus.
   *
   * Memoised because `subscribe()` registers handlers ON THE INSTANCE:
   * a factory that returned a fresh bus per call would register
   * bootstrap's handlers on one object and publish to another, and
   * nothing would ever be delivered.
   */
  static getInstance(): IEventBus {
    if (!instance) {
      const config = getOutboxConfig();

      if (config.mode === 'outbox') {
        /**
         * Loaded LAZILY, and for two independent reasons.
         *
         * 1. CYCLE. OutboxPublisher -> OutboxRepository ->
         *    BaseRepository, and the repository layer's own import graph
         *    reaches back here. A top-level import made
         *    `BaseRepository` undefined at the moment OutboxRepository
         *    extended it -- 22 suites died with "Class extends value
         *    undefined". Deferring the require to first use breaks the
         *    cycle without restructuring the repository layer.
         *
         * 2. MEMORY MODE MUST NOT TOUCH MONGO. Tests and local dev run
         *    in memory mode; eagerly importing the repository would drag
         *    the whole database graph into every suite that publishes an
         *    event, for an implementation it will never construct.
         */
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { OutboxEventBus } = require('../outbox/OutboxEventBus');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { OutboxPublisher } = require('../outbox/OutboxPublisher');
        instance = new OutboxEventBus(new OutboxPublisher()) as IEventBus;
      } else {
        instance = new InMemoryEventBus();
      }
    }
    return instance;
  }

  /**
   * The bus the OutboxProcessor should dispatch into.
   *
   * In outbox mode this is the wrapper's INNER in-memory bus -- the same
   * instance bootstrap registered handlers on. Dispatching to the
   * wrapper instead would write each event straight back into the outbox
   * it was just claimed from.
   *
   * In memory mode there is no processor; the bus is returned as-is so a
   * caller that asks does not have to special-case the mode.
   */
  static getDispatchTarget(): IEventBus {
    const bus = EventBusFactory.getInstance();
    const maybeOutbox = bus as Partial<OutboxEventBusType>;
    return typeof maybeOutbox.getDispatchBus === 'function'
      ? maybeOutbox.getDispatchBus()
      : bus;
  }

  /**
   * Whether this process is publishing durably.
   *
   * Duck-typed on `getDispatchBus` rather than `instanceof`, because the
   * class is loaded through a lazy require: an `instanceof` check would
   * need a top-level import and reintroduce the cycle above.
   */
  static isDurable(): boolean {
    const bus = EventBusFactory.getInstance() as Partial<OutboxEventBusType>;
    return typeof bus.getDispatchBus === 'function';
  }

  static reset(): void {
    instance = null;
  }
}
