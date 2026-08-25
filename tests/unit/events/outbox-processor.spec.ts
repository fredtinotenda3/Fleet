// tests/unit/events/outbox-processor.spec.ts
//
// PHASE 3 -- claim, dispatch, retry, dead-letter, idempotency.
//
// ---------------------------------------------------------------------
// WHY A FAKE REPOSITORY, AND WHAT THAT DOES NOT PROVE
// ---------------------------------------------------------------------
// There is no MongoDB in this test environment (`test:integration` runs
// `--passWithNoTests`), so the repository is replaced with an in-memory
// double that implements the same lifecycle contract.
//
// STATED LIMITATION, because it matters: this proves the PROCESSOR's
// logic -- that it claims before dispatching, retries with backoff,
// dead-letters at the threshold, skips already-processed events, and
// reclaims expired leases. It does NOT prove Mongo's `findOneAndUpdate`
// is atomic under real concurrency, because the fake serialises
// everything. That atomicity is a property of MongoDB and of the unique
// index declared in indexes.outbox-addendum.ts, asserted structurally in
// tests/security/outbox-indexes.spec.ts.
//
// The fake is deliberately strict about the things that matter: it
// enforces the lease-owner guard on completion, so a test cannot pass by
// closing a row it does not own.

import { OutboxProcessor } from '@/server/events/outbox/OutboxProcessor';
import { OutboxEvent, OutboxStatus } from '@/server/events/outbox/OutboxEvent';
import { OutboxRepository, ClaimOptions, FailureOutcome } from '@/server/events/outbox/OutboxRepository';
import { OutboxConfig } from '@/server/events/outbox/outbox.config';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { IEventPublisher } from '@/server/events/base/IEventPublisher';

jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: {
    logError: jest.fn(),
    logWarn: jest.fn(),
    logInfo: jest.fn(),
    logDebug: jest.fn(),
  },
}));

class FakeOutboxRepository {
  rows: OutboxEvent[] = [];

  seed(partial: Partial<OutboxEvent> & { eventId: string }): OutboxEvent {
    const row: OutboxEvent = {
      _id: partial.eventId,
      tenantId: partial.tenantId ?? 'tenant-a',
      eventId: partial.eventId,
      eventName: partial.eventName ?? 'test.event',
      payload: partial.payload ?? { hello: 'world' },
      metadata: partial.metadata,
      status: partial.status ?? 'pending',
      processed: partial.processed ?? false,
      attempts: partial.attempts ?? 0,
      createdAt: partial.createdAt ?? new Date('2026-08-20T09:00:00.000Z'),
      updatedAt: new Date(),
      isDeleted: false,
      ...partial,
    } as OutboxEvent;
    this.rows.push(row);
    return row;
  }

  async claimBatch(options: ClaimOptions): Promise<OutboxEvent[]> {
    const now = new Date();
    const claimed: OutboxEvent[] = [];

    const due = this.rows
      .filter((r) => {
        if (r.status === 'pending') {
          if (r.nextAttemptAt && r.nextAttemptAt > now) return false;
          if (r.scheduledAt && r.scheduledAt > now) return false;
          return true;
        }
        // Stale-lease reclaim.
        return r.status === 'processing' && !!r.leaseExpiresAt && r.leaseExpiresAt <= now;
      })
      .sort((a, b) => (a.createdAt! < b.createdAt! ? -1 : 1));

    for (const row of due.slice(0, options.batchSize)) {
      row.status = 'processing';
      row.leaseOwner = options.leaseOwner;
      row.leaseExpiresAt = new Date(now.getTime() + options.leaseTimeoutMs);
      claimed.push({ ...row });
    }
    return claimed;
  }

  async markProcessed(eventId: string, leaseOwner: string): Promise<boolean> {
    const row = this.rows.find((r) => r.eventId === eventId);
    // The lease-owner guard is enforced, not assumed: a processor whose
    // claim was stolen must not be able to close the row.
    if (!row || row.status !== 'processing' || row.leaseOwner !== leaseOwner) return false;

    row.status = 'processed';
    row.processed = true;
    row.processedAt = new Date();
    delete row.leaseOwner;
    delete row.leaseExpiresAt;
    return true;
  }

  async recordFailure(
    eventId: string,
    leaseOwner: string,
    error: string,
    policy: { maxAttempts: number; backoffBaseMs: number; backoffMaxMs: number }
  ): Promise<FailureOutcome> {
    const row = this.rows.find((r) => r.eventId === eventId);
    if (!row || row.status !== 'processing' || row.leaseOwner !== leaseOwner) return 'lease_lost';

    row.attempts = (row.attempts ?? 0) + 1;
    row.lastError = error.slice(0, 500);
    delete row.leaseOwner;
    delete row.leaseExpiresAt;

    if (row.attempts >= policy.maxAttempts) {
      row.status = 'dead_letter';
      row.deadLetteredAt = new Date();
      return 'dead_lettered';
    }

    const delay = Math.min(
      policy.backoffBaseMs * Math.pow(2, row.attempts - 1),
      policy.backoffMaxMs
    );
    row.status = 'pending';
    row.nextAttemptAt = new Date(Date.now() + delay);
    return 'retry_scheduled';
  }

  async isAlreadyProcessed(eventId: string): Promise<boolean> {
    return this.rows.some((r) => r.eventId === eventId && r.status === 'processed');
  }

  find(eventId: string): OutboxEvent | undefined {
    return this.rows.find((r) => r.eventId === eventId);
  }
}

class RecordingDispatcher implements IEventPublisher {
  readonly received: DomainEvent[] = [];
  failTimes = 0;

  async publish(event: DomainEvent): Promise<void> {
    if (this.failTimes > 0) {
      this.failTimes -= 1;
      throw new Error('handler exploded');
    }
    this.received.push(event);
  }
}

const CONFIG: OutboxConfig = {
  mode: 'outbox',
  processorEnabled: true,
  processorExternal: false,
  intervalMs: 1000,
  maxAttempts: 3,
  leaseTimeoutMs: 30_000,
  backoffBaseMs: 1000,
  backoffMaxMs: 60_000,
  batchSize: 10,
};

function build(overrides: Partial<OutboxConfig> = {}) {
  const repo = new FakeOutboxRepository();
  const dispatcher = new RecordingDispatcher();
  const processor = new OutboxProcessor(
    dispatcher,
    repo as unknown as OutboxRepository,
    { ...CONFIG, ...overrides }
  );
  return { repo, dispatcher, processor };
}

describe('Phase 3: the processor claims, dispatches and completes', () => {
  it('delivers a pending event and marks it processed', async () => {
    const { repo, dispatcher, processor } = build();
    repo.seed({ eventId: 'evt-1', eventName: 'vehicle.created' });

    const result = await processor.processBatch();

    expect(result.claimed).toBe(1);
    expect(result.processed).toBe(1);
    expect(dispatcher.received).toHaveLength(1);
    expect(repo.find('evt-1')!.status).toBe('processed');
  });

  it('keeps `processed: true` in step with status for the cleanup job', () => {
    // workers/cleanup.worker.ts purges {processed: true, processedAt}.
    // Phase 3 added `status` without breaking that query.
    const { repo, processor } = build();
    repo.seed({ eventId: 'evt-1' });

    return processor.processBatch().then(() => {
      const row = repo.find('evt-1')!;
      expect(row.processed).toBe(true);
      expect(row.processedAt).toBeInstanceOf(Date);
    });
  });

  it('rehydrates the event with its ORIGINAL id and occurrence time', async () => {
    // eventId is the deduplication key -- a fresh id on every retry
    // would make at-least-once delivery into at-least-once SIDE EFFECTS.
    // occurredOn is when the event happened, not when it was delivered:
    // after an outage, replayed events must not all appear to have
    // occurred at replay time.
    const { repo, dispatcher, processor } = build();
    const createdAt = new Date('2026-08-20T09:00:00.000Z');
    repo.seed({ eventId: 'evt-1', eventName: 'fuel.logged', createdAt });

    await processor.processBatch();

    expect(dispatcher.received[0].eventId).toBe('evt-1');
    expect(dispatcher.received[0].eventName).toBe('fuel.logged');
    expect(dispatcher.received[0].occurredOn.toISOString()).toBe(createdAt.toISOString());
  });

  it('preserves tenant context on the rehydrated event', async () => {
    // The processor is cross-tenant by necessity; isolation is preserved
    // by each row carrying its own tenant, which handlers scope from.
    const { repo, dispatcher, processor } = build();
    repo.seed({ eventId: 'evt-1', metadata: { tenantId: 'tenant-b', userId: 'u1' } });

    await processor.processBatch();

    expect(dispatcher.received[0].metadata?.tenantId).toBe('tenant-b');
  });

  it('delivers oldest first', async () => {
    // An outbox is a queue: delivering a newer event before an older one
    // for the same aggregate is how a projection applies updates out of
    // order.
    const { repo, dispatcher, processor } = build();
    repo.seed({ eventId: 'newer', createdAt: new Date('2026-08-20T10:00:00Z') });
    repo.seed({ eventId: 'older', createdAt: new Date('2026-08-20T08:00:00Z') });

    await processor.processBatch();

    expect(dispatcher.received.map((e) => e.eventId)).toEqual(['older', 'newer']);
  });

  it('does not claim an event whose scheduledAt is in the future', async () => {
    const { repo, processor } = build();
    repo.seed({ eventId: 'evt-1', scheduledAt: new Date(Date.now() + 60_000) });

    expect((await processor.processBatch()).claimed).toBe(0);
  });
});

describe('Phase 3: retry with exponential backoff', () => {
  it('schedules a retry instead of failing permanently', async () => {
    const { repo, dispatcher, processor } = build();
    repo.seed({ eventId: 'evt-1' });
    dispatcher.failTimes = 1;

    const result = await processor.processBatch();

    expect(result.retryScheduled).toBe(1);
    const row = repo.find('evt-1')!;
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('handler exploded');
  });

  it('does not retry immediately -- nextAttemptAt is in the future', async () => {
    // Without this, a handler failing because a downstream service is
    // down is retried on every poll: one outage becomes a self-inflicted
    // load test against the thing already struggling.
    const { repo, dispatcher, processor } = build();
    repo.seed({ eventId: 'evt-1' });
    dispatcher.failTimes = 1;

    await processor.processBatch();

    expect(repo.find('evt-1')!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('backs off exponentially across attempts', async () => {
    const { repo, dispatcher, processor } = build();
    repo.seed({ eventId: 'evt-1' });

    dispatcher.failTimes = 1;
    await processor.processBatch();
    const firstDelay = repo.find('evt-1')!.nextAttemptAt!.getTime() - Date.now();

    // Make it claimable again, then fail a second time.
    repo.find('evt-1')!.nextAttemptAt = new Date(Date.now() - 1);
    dispatcher.failTimes = 1;
    await processor.processBatch();
    const secondDelay = repo.find('evt-1')!.nextAttemptAt!.getTime() - Date.now();

    expect(secondDelay).toBeGreaterThan(firstDelay);
  });

  it('succeeds on a later attempt after a transient failure', async () => {
    const { repo, dispatcher, processor } = build();
    repo.seed({ eventId: 'evt-1' });

    dispatcher.failTimes = 1;
    await processor.processBatch();
    expect(repo.find('evt-1')!.status).toBe('pending');

    repo.find('evt-1')!.nextAttemptAt = new Date(Date.now() - 1);
    await processor.processBatch();

    expect(repo.find('evt-1')!.status).toBe('processed');
    expect(dispatcher.received).toHaveLength(1);
  });
});

describe('Phase 3: dead-letter after repeated failure', () => {
  it('dead-letters at maxAttempts and stops retrying', async () => {
    const { repo, dispatcher, processor } = build({ maxAttempts: 2 });
    repo.seed({ eventId: 'evt-1' });

    dispatcher.failTimes = 10;

    await processor.processBatch();
    repo.find('evt-1')!.nextAttemptAt = new Date(Date.now() - 1);
    const second = await processor.processBatch();

    expect(second.deadLettered).toBe(1);
    const row = repo.find('evt-1')!;
    expect(row.status).toBe('dead_letter');
    expect(row.deadLetteredAt).toBeInstanceOf(Date);
  });

  it('a dead-lettered row is never claimed again', async () => {
    // Terminal by design: a poisoned event needs a human, and infinite
    // retry only guarantees the log fills before anyone notices.
    const { repo, processor } = build();
    repo.seed({ eventId: 'evt-1', status: 'dead_letter', attempts: 5 });

    expect((await processor.processBatch()).claimed).toBe(0);
  });
});

describe('Phase 3: idempotency and crash recovery', () => {
  it('skips an event that has already been processed', async () => {
    // A row can be reclaimed after lease expiry even though its handlers
    // already ran (crash between dispatch and markProcessed).
    const { repo, dispatcher, processor } = build();
    const row = repo.seed({ eventId: 'evt-1', status: 'processed', processed: true });
    // Force it back into a claimable state, as a stale lease would.
    row.status = 'pending';
    repo.rows.push({ ...row, _id: 'dup', status: 'processed' } as OutboxEvent);

    const result = await processor.processBatch();

    expect(result.skippedDuplicate).toBe(1);
    expect(dispatcher.received).toHaveLength(0);
  });

  it('reclaims an event whose lease expired -- the crash-recovery path', async () => {
    // A processor that died mid-dispatch cannot strand an event: its
    // claim times out and another processor picks the row up.
    const { repo, dispatcher, processor } = build();
    repo.seed({
      eventId: 'evt-1',
      status: 'processing',
      leaseOwner: 'dead-processor',
      leaseExpiresAt: new Date(Date.now() - 1000),
    });

    const result = await processor.processBatch();

    expect(result.claimed).toBe(1);
    expect(result.processed).toBe(1);
    expect(dispatcher.received).toHaveLength(1);
  });

  it('does NOT reclaim an event whose lease is still valid', async () => {
    // Another processor is legitimately working on it.
    const { repo, processor } = build();
    repo.seed({
      eventId: 'evt-1',
      status: 'processing',
      leaseOwner: 'other-processor',
      leaseExpiresAt: new Date(Date.now() + 30_000),
    });

    expect((await processor.processBatch()).claimed).toBe(0);
  });

  it('cannot close a row whose lease was stolen', async () => {
    // Reported as lease_lost rather than forced closed: the new owner
    // will finish it, and closing work we no longer own would close the
    // row underneath them.
    const { repo, dispatcher, processor } = build();
    repo.seed({ eventId: 'evt-1' });

    const originalMark = repo.markProcessed.bind(repo);
    jest.spyOn(repo, 'markProcessed').mockImplementation(async (eventId) => {
      // Simulate the lease being stolen mid-dispatch.
      const row = repo.find(eventId)!;
      row.leaseOwner = 'someone-else';
      return originalMark(eventId, 'someone-else-wrong');
    });

    const result = await processor.processBatch();

    expect(result.processed).toBe(0);
    expect(dispatcher.received).toHaveLength(1); // dispatch DID happen
  });
});

describe('Phase 3: batching', () => {
  it('respects the configured batch size', async () => {
    const { repo, processor } = build({ batchSize: 2 });
    for (let i = 0; i < 5; i += 1) {
      repo.seed({ eventId: `evt-${i}`, createdAt: new Date(Date.now() + i) });
    }

    expect((await processor.processBatch()).claimed).toBe(2);
  });

  it('returns a zero result when there is nothing to do', async () => {
    const { processor } = build();
    const result = await processor.processBatch();

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      retryScheduled: 0,
      deadLettered: 0,
      skippedDuplicate: 0,
    });
  });

  it('one failing event does not stop the rest of the batch', async () => {
    const { repo, dispatcher, processor } = build();
    repo.seed({ eventId: 'evt-bad', createdAt: new Date(Date.now() - 1000) });
    repo.seed({ eventId: 'evt-good', createdAt: new Date() });

    dispatcher.failTimes = 1; // the first (oldest) one fails

    const result = await processor.processBatch();

    expect(result.retryScheduled).toBe(1);
    expect(result.processed).toBe(1);
    expect(repo.find('evt-good')!.status).toBe('processed');
  });
});
