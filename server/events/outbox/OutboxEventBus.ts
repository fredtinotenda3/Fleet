// server/events/outbox/OutboxEventBus.ts
//
// PHASE 3 -- the durable bus, shaped like the one 131 call sites expect.
//
// ---------------------------------------------------------------------
// WHY THIS EXISTS AT ALL
// ---------------------------------------------------------------------
// `OutboxPublisher` implements `IEventPublisher` -- one method,
// `publish`. But `EventBusFactory.getInstance()` returns `IEventBus`,
// which also has `subscribe`, `unsubscribe` and `use`, and there are 131
// call sites plus `server/events/bootstrap.ts` (which registers every
// handler through `bus.subscribe`).
//
// Returning a bare publisher from the factory would break all of them at
// compile time and would have meant touching 131 files to enable
// durability. So the outbox is composed INTO a bus:
//
//   publish()             -> durable write, nothing else
//   subscribe/unsubscribe -> delegated to the in-memory bus
//   use()                 -> delegated to the in-memory bus
//
// Handler registration and middleware are unchanged and unaware. The
// only thing that moves is WHEN dispatch happens: the processor takes
// the row off the outbox and publishes it to this same in-memory bus,
// where the handlers registered at bootstrap are waiting.
//
//   publish  -> [outbox row]  ...  processor -> inner bus -> handlers
//
// ---------------------------------------------------------------------
// THE INNER BUS IS SHARED WITH THE PROCESSOR ON PURPOSE
// ---------------------------------------------------------------------
// `getDispatchBus()` hands the processor the SAME InMemoryEventBus this
// wrapper delegates subscriptions to. If the processor had its own bus,
// it would dispatch into an instance with no handlers registered --
// events would be claimed, marked processed, and delivered to nobody.
// Silently, with a healthy-looking outbox.

import { IEventBus } from '../bus/IEventBus';
import { InMemoryEventBus } from '../bus/InMemoryEventBus';
import { IEventHandler } from '../base/IEventHandler';
import { IEvent } from '../base/IEvent';
import { DomainEvent } from '../base/DomainEvent';
import { OutboxPublisher } from './OutboxPublisher';

export class OutboxEventBus implements IEventBus {
  constructor(
    private readonly publisher: OutboxPublisher,
    /**
     * Where handlers are registered and where the processor dispatches.
     * One instance, two roles -- see the header for why sharing it is
     * required rather than incidental.
     */
    private readonly inner: InMemoryEventBus = new InMemoryEventBus()
  ) {}

  /**
   * Durable write ONLY. Handlers are not invoked here.
   *
   * See OutboxPublisher for why immediate in-memory dispatch is
   * deliberately absent: doing both means every handler with a side
   * effect fires twice for every event, once now and once when the
   * processor picks the row up.
   */
  async publish(event: DomainEvent): Promise<void> {
    await this.publisher.publish(event);
  }

  subscribe<TEvent extends IEvent>(eventName: string, handler: IEventHandler<TEvent>): void {
    this.inner.subscribe(eventName, handler);
  }

  unsubscribe<TEvent extends IEvent>(eventName: string, handler: IEventHandler<TEvent>): void {
    this.inner.unsubscribe(eventName, handler);
  }

  use(middleware: (event: IEvent, next: () => Promise<void>) => Promise<void>): void {
    // Middleware (logging, metrics, audit, retry, validation) runs on
    // DISPATCH, which now happens inside the processor. Registering it
    // on the inner bus keeps it applying to every handler exactly as
    // before -- it simply runs in the processor's process rather than
    // the publisher's.
    this.inner.use(middleware);
  }

  /**
   * The bus the OutboxProcessor must dispatch to.
   *
   * Deliberately NOT `EventBusFactory.getInstance()`: in outbox mode
   * that returns THIS wrapper, so a processor asking the factory for its
   * dispatch target would publish events straight back into the outbox
   * it is draining. An infinite loop that grows a collection.
   */
  getDispatchBus(): InMemoryEventBus {
    return this.inner;
  }
}
