// tests/unit/events/outbox-publisher-integration.spec.ts
//
// PHASE 3 -- publication writes durably, and the full loop delivers.
//
// LIMITATION, STATED UP FRONT: there is no MongoDB in this test
// environment, so the repository is an in-memory double implementing the
// same contract. This proves the PUBLISHER writes before returning, that
// the bus wrapper does not dispatch inline, and that publish → claim →
// dispatch → handler works end to end. It does not prove Mongo's
// durability or its per-document atomicity -- those are properties of
// the database and of the unique index asserted in
// tests/security/outbox-indexes.spec.ts.

import { OutboxPublisher } from '@/server/events/outbox/OutboxPublisher';
import { OutboxEventBus } from '@/server/events/outbox/OutboxEventBus';
import { OutboxProcessor } from '@/server/events/outbox/OutboxProcessor';
import { OutboxRepository } from '@/server/events/outbox/OutboxRepository';
import { OutboxEvent } from '@/server/events/outbox/OutboxEvent';
import { OutboxConfig } from '@/server/events/outbox/outbox.config';
import { InMemoryEventBus } from '@/server/events/bus/InMemoryEventBus';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { IEventHandler } from '@/server/events/base/IEventHandler';

jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: {
    logError: jest.fn(),
    logWarn: jest.fn(),
    logInfo: jest.fn(),
    logDebug: jest.fn(),
  },
}));

class TestEvent extends DomainEvent {
  constructor(payload: Record<string, unknown>, metadata?: Record<string, unknown>) {
    super('test.happened', payload, metadata);
  }
}

/** In-memory stand-in with the same lifecycle contract as the real repo. */
class FakeRepo {
  rows: OutboxEvent[] = [];

  async append(row: Omit<OutboxEvent, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>) {
    // Models the UNIQUE index on eventId: a duplicate is rejected here,
    // not by a read-then-write check that could interleave.
    if (this.rows.some((r) => r.eventId === row.eventId)) return false;
    this.rows.push({
      ...row,
      _id: row.eventId,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    } as OutboxEvent);
    return true;
  }

  async claimBatch({ batchSize, leaseTimeoutMs, leaseOwner }: {
    batchSize: number; leaseTimeoutMs: number; leaseOwner: string;
  }) {
    const now = new Date();
    return this.rows
      .filter((r) => r.status === 'pending' && (!r.nextAttemptAt || r.nextAttemptAt <= now))
      .slice(0, batchSize)
      .map((r) => {
        r.status = 'processing';
        r.leaseOwner = leaseOwner;
        r.leaseExpiresAt = new Date(now.getTime() + leaseTimeoutMs);
        return { ...r };
      });
  }

  async markProcessed(eventId: string, leaseOwner: string) {
    const row = this.rows.find((r) => r.eventId === eventId);
    if (!row || row.leaseOwner !== leaseOwner) return false;
    row.status = 'processed';
    row.processed = true;
    row.processedAt = new Date();
    return true;
  }

  async recordFailure(eventId: string, leaseOwner: string, error: string, policy: {
    maxAttempts: number; backoffBaseMs: number; backoffMaxMs: number;
  }) {
    const row = this.rows.find((r) => r.eventId === eventId);
    if (!row || row.leaseOwner !== leaseOwner) return 'lease_lost' as const;
    row.attempts += 1;
    row.lastError = error;
    if (row.attempts >= policy.maxAttempts) {
      row.status = 'dead_letter';
      return 'dead_lettered' as const;
    }
    row.status = 'pending';
    row.nextAttemptAt = new Date(Date.now() + policy.backoffBaseMs);
    return 'retry_scheduled' as const;
  }

  async isAlreadyProcessed(eventId: string) {
    return this.rows.some((r) => r.eventId === eventId && r.status === 'processed');
  }
}

const CONFIG: OutboxConfig = {
  mode: 'outbox',
  processorEnabled: true,
  processorExternal: false,
  intervalMs: 1000,
  maxAttempts: 3,
  leaseTimeoutMs: 30_000,
  backoffBaseMs: 1,
  backoffMaxMs: 10,
  batchSize: 50,
};

describe('Phase 3: publish writes to the outbox before returning', () => {
  it('records the event durably', async () => {
    const repo = new FakeRepo();
    const publisher = new OutboxPublisher(repo as unknown as OutboxRepository);

    const event = new TestEvent({ vehicleId: 'v1' }, { tenantId: 'tenant-a' });
    await publisher.publish(event);

    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({
      eventId: event.eventId,
      eventName: 'test.happened',
      status: 'pending',
      processed: false,
      attempts: 0,
      tenantId: 'tenant-a',
    });
  });

  it('carries tenantId from event metadata onto the row', async () => {
    const repo = new FakeRepo();
    const publisher = new OutboxPublisher(repo as unknown as OutboxRepository);

    await publisher.publish(new TestEvent({}, { tenantId: 'tenant-b' }));

    expect(repo.rows[0].tenantId).toBe('tenant-b');
  });

  it("labels a tenantless platform event 'system', NOT 'default'", async () => {
    // 'default' is a Phase 0 fail-closed sentinel that raises
    // TenantScopeError. The old publisher used it, so every scoped read
    // of these rows would have thrown.
    const repo = new FakeRepo();
    const publisher = new OutboxPublisher(repo as unknown as OutboxRepository);

    await publisher.publish(new TestEvent({}));

    expect(repo.rows[0].tenantId).toBe('system');
    expect(repo.rows[0].tenantId).not.toBe('default');
  });

  it('a duplicate publish produces exactly one row', async () => {
    const repo = new FakeRepo();
    const publisher = new OutboxPublisher(repo as unknown as OutboxRepository);

    const event = new TestEvent({}, { tenantId: 'tenant-a' });
    await publisher.publish(event);
    await publisher.publish(event);

    expect(repo.rows).toHaveLength(1);
  });

  it('THROWS when the durable write fails rather than degrading', async () => {
    // Quietly downgrading a durable publish to best-effort is precisely
    // the silent data loss Phase 3 removes.
    const repo = {
      append: jest.fn().mockRejectedValue(new Error('mongo down')),
    };
    const publisher = new OutboxPublisher(repo as unknown as OutboxRepository);

    await expect(publisher.publish(new TestEvent({}))).rejects.toThrow('mongo down');
  });
});

describe('Phase 3: the bus wrapper does not dispatch inline', () => {
  it('publish() invokes NO handler', async () => {
    // The old OutboxPublisher wrote the row AND dispatched in-process.
    // Once the processor runs it picks the same row up -- so every
    // handler with a side effect fires twice for every event. Not a rare
    // race: the steady state.
    const repo = new FakeRepo();
    const inner = new InMemoryEventBus();
    const bus = new OutboxEventBus(
      new OutboxPublisher(repo as unknown as OutboxRepository),
      inner
    );

    const handle = jest.fn();
    bus.subscribe('test.happened', { handle } as unknown as IEventHandler<DomainEvent>);

    await bus.publish(new TestEvent({}, { tenantId: 'tenant-a' }));

    expect(repo.rows).toHaveLength(1);
    expect(handle).not.toHaveBeenCalled();
  });

  it('exposes the SAME inner bus the processor must dispatch to', () => {
    // If the processor had its own bus it would dispatch into an
    // instance with no handlers -- events claimed, marked processed, and
    // delivered to nobody. Silently, with a healthy-looking outbox.
    const inner = new InMemoryEventBus();
    const bus = new OutboxEventBus(new OutboxPublisher(new FakeRepo() as unknown as OutboxRepository), inner);

    expect(bus.getDispatchBus()).toBe(inner);
  });

  it('delegates subscribe/unsubscribe/use so bootstrap is unchanged', () => {
    const inner = new InMemoryEventBus();
    const bus = new OutboxEventBus(new OutboxPublisher(new FakeRepo() as unknown as OutboxRepository), inner);

    const subscribeSpy = jest.spyOn(inner, 'subscribe');
    const useSpy = jest.spyOn(inner, 'use');

    const handler = { handle: jest.fn() } as unknown as IEventHandler<DomainEvent>;
    bus.subscribe('x', handler);
    bus.use(async (_e, next) => next());

    expect(subscribeSpy).toHaveBeenCalledWith('x', handler);
    expect(useSpy).toHaveBeenCalled();
  });
});

describe('Phase 3: end-to-end durability loop', () => {
  function wire() {
    const repo = new FakeRepo();
    const inner = new InMemoryEventBus();
    const bus = new OutboxEventBus(
      new OutboxPublisher(repo as unknown as OutboxRepository),
      inner
    );
    const processor = new OutboxProcessor(
      bus.getDispatchBus(),
      repo as unknown as OutboxRepository,
      CONFIG
    );
    return { repo, inner, bus, processor };
  }

  it('publish → processor → handler receives the event', async () => {
    const { bus, processor } = wire();

    const handle = jest.fn();
    bus.subscribe('test.happened', { handle } as unknown as IEventHandler<DomainEvent>);

    const event = new TestEvent({ n: 1 }, { tenantId: 'tenant-a' });
    await bus.publish(event);
    expect(handle).not.toHaveBeenCalled(); // not yet — that is the point

    await processor.processBatch();

    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0][0].eventId).toBe(event.eventId);
  });

  it('an event published before a crash is delivered after restart', async () => {
    // The whole reason Phase 3 exists. The row outlives the process that
    // wrote it.
    const { repo, bus } = wire();

    await bus.publish(new TestEvent({ n: 1 }, { tenantId: 'tenant-a' }));

    // "Restart": a brand-new bus, handlers and processor over the same
    // durable rows.
    const freshInner = new InMemoryEventBus();
    const handle = jest.fn();
    freshInner.subscribe('test.happened', { handle } as unknown as IEventHandler<DomainEvent>);

    const freshProcessor = new OutboxProcessor(
      freshInner,
      repo as unknown as OutboxRepository,
      CONFIG
    );
    await freshProcessor.processBatch();

    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('re-running the processor does NOT re-invoke handlers', async () => {
    const { bus, processor } = wire();

    const handle = jest.fn();
    bus.subscribe('test.happened', { handle } as unknown as IEventHandler<DomainEvent>);

    await bus.publish(new TestEvent({}, { tenantId: 'tenant-a' }));
    await processor.processBatch();
    await processor.processBatch();
    await processor.processBatch();

    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('a failing handler leaves the event for retry, then delivers it', async () => {
    const { bus, processor } = wire();

    let attempts = 0;
    const handle = jest.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('downstream unavailable');
    });
    bus.subscribe('test.happened', { handle } as unknown as IEventHandler<DomainEvent>);

    await bus.publish(new TestEvent({}, { tenantId: 'tenant-a' }));

    const first = await processor.processBatch();
    expect(first.retryScheduled).toBe(1);

    await new Promise((r) => setTimeout(r, 5)); // let the backoff elapse
    const second = await processor.processBatch();

    expect(second.processed).toBe(1);
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it('preserves tenant separation across events in one batch', async () => {
    const { bus, processor } = wire();

    const seen: string[] = [];
    bus.subscribe('test.happened', {
      handle: async (e: DomainEvent) => {
        seen.push(e.metadata?.tenantId as string);
      },
    } as unknown as IEventHandler<DomainEvent>);

    await bus.publish(new TestEvent({}, { tenantId: 'tenant-a' }));
    await bus.publish(new TestEvent({}, { tenantId: 'tenant-b' }));
    await processor.processBatch();

    // Each handler invocation carries its OWN tenant; the processor
    // never merges or defaults them.
    expect(seen.sort()).toEqual(['tenant-a', 'tenant-b']);
  });
});

describe('Phase 3: handler failure must reach the processor', () => {
  it('publishOrThrow propagates a handler failure', async () => {
    // THE HAZARD THIS GUARDS.
    //
    // InMemoryEventBus.publish() deliberately never rejects -- correct
    // for its fire-and-forget callers, catastrophic for the processor.
    // If the processor dispatched through publish(), a failing handler
    // would look like success, the row would be marked processed, and
    // retry/backoff/dead-letter could never fire. The entire durability
    // machinery would be an expensive no-op that loses precisely the
    // events it exists to protect.
    const bus = new InMemoryEventBus();
    bus.subscribe('test.happened', {
      handle: async () => {
        throw new Error('downstream unavailable');
      },
    } as unknown as IEventHandler<DomainEvent>);

    const event = new TestEvent({}, { tenantId: 'tenant-a' });

    // publish() absorbs it, by design.
    await expect(bus.publish(event)).resolves.toBeUndefined();

    // publishOrThrow() does not.
    await expect(bus.publishOrThrow(event)).rejects.toThrow('downstream unavailable');
  });

  it('one failing handler does not prevent its siblings from running', async () => {
    // Isolation is preserved: the aggregate outcome is reported, but a
    // bad handler still does not stop the others.
    const bus = new InMemoryEventBus();
    const good = jest.fn();

    bus.subscribe('test.happened', {
      handle: async () => {
        throw new Error('bad handler');
      },
    } as unknown as IEventHandler<DomainEvent>);
    bus.subscribe('test.happened', { handle: good } as unknown as IEventHandler<DomainEvent>);

    await expect(
      bus.publishOrThrow(new TestEvent({}, { tenantId: 'tenant-a' }))
    ).rejects.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('resolves when there are no handlers at all', async () => {
    // An event nobody subscribes to is delivered, not failed -- otherwise
    // every unhandled event would retry to dead-letter.
    const bus = new InMemoryEventBus();
    await expect(
      bus.publishOrThrow(new TestEvent({}, { tenantId: 'tenant-a' }))
    ).resolves.toBeUndefined();
  });
});
