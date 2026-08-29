// tests/integration/persistence-invariants.spec.ts
//
// HARDENING (item 2) -- the assertions every previous phase had to
// defer.
//
// Phases 1, 3, 5 and 6 each added a uniqueness constraint and each wrote
// in its own summary that the constraint could not be proven, because an
// in-memory double cannot demonstrate that a unique index rejects a
// concurrent duplicate -- the double IS the thing being trusted.
//
// These run against a real mongod. When one cannot be obtained the whole
// file skips with a loud warning (and FAILS when REQUIRE_INTEGRATION_DB
// is set, which CI does). See support/mongo-harness.ts for the fallbacks.

import { Db } from 'mongodb';
import { connectMongo, race, describeWithMongo, MONGO_AVAILABLE, MongoHarness } from './support/mongo-harness';

let harness: MongoHarness | null = null;
let db: Db;

beforeAll(async () => {
  if (!MONGO_AVAILABLE) return;
  harness = await connectMongo('fleet_integration');
  db = harness.db;
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

beforeEach(async () => {
  await harness?.clear();
});

/**
 * Availability is decided SYNCHRONOUSLY at module load, from the URI
 * globalSetup published. Deciding it in `beforeAll` does not work:
 * describe blocks are evaluated first, so the gate would always see
 * "unavailable" and skip even when a database was running -- a gate that
 * always skips is exactly the coverage theatre these tests remove.
 *
 * `describe.skip` rather than an early `return` inside each test,
 * because a returning test is reported by Jest as PASSED.
 */

describeWithMongo('Phase 1: the telemetry idempotency index', () => {
  const COLLECTION = 'tbltelematics';

  async function createIndex() {
    await db
      .collection(COLLECTION)
      .createIndex(
        { tenantId: 1, vehicleId: 1, deviceId: 1, timestamp: 1 },
        { name: 'uniq_telematics_tenant_vehicle_device_ts', unique: true }
      );
  }

  it('REJECTS a concurrent duplicate reading', async () => {
    // THE assertion Phase 1 could not make. Without the unique index,
    // two concurrent history backfills over the same window both miss
    // the upsert filter and both insert.
    await createIndex();

    const reading = {
      tenantId: 'tenant-a',
      vehicleId: 'vehicle-1',
      deviceId: 'eagletrack-123',
      timestamp: new Date('2026-08-20T09:00:00Z'),
    };

    const { fulfilled, duplicateKeyErrors, otherErrors } = await race(10, () =>
      db.collection(COLLECTION).insertOne({ ...reading })
    );

    expect(otherErrors).toEqual([]);
    expect(fulfilled).toHaveLength(1);
    expect(duplicateKeyErrors).toBe(9);
    expect(await db.collection(COLLECTION).countDocuments()).toBe(1);
  });

  it('permits readings that differ in ANY key component', async () => {
    // A constraint that is too tight is as damaging as one too loose:
    // two devices on one vehicle, or two vehicles reporting at the same
    // instant, are legitimate.
    await createIndex();

    const base = {
      tenantId: 'tenant-a',
      vehicleId: 'vehicle-1',
      deviceId: 'd-1',
      timestamp: new Date('2026-08-20T09:00:00Z'),
    };

    await db.collection(COLLECTION).insertMany([
      base,
      { ...base, tenantId: 'tenant-b' },
      { ...base, vehicleId: 'vehicle-2' },
      { ...base, deviceId: 'd-2' },
      { ...base, timestamp: new Date('2026-08-20T09:00:01Z') },
    ]);

    expect(await db.collection(COLLECTION).countDocuments()).toBe(5);
  });

  it('makes the $setOnInsert upsert genuinely idempotent under concurrency', async () => {
    // The real shape used by bulkUpsertHistoricalReadings. The index is
    // what makes a concurrent upsert atomic; without it Mongo documents
    // that two upserts can both insert.
    await createIndex();

    const filter = {
      tenantId: 'tenant-a',
      vehicleId: 'vehicle-1',
      deviceId: 'd-1',
      timestamp: new Date('2026-08-20T09:00:00Z'),
    };

    const { otherErrors } = await race(10, () =>
      db
        .collection(COLLECTION)
        .updateOne(filter, { $setOnInsert: { ...filter, speed: 40 } }, { upsert: true })
    );

    // Losers of the race raise 11000, which the production code catches
    // and treats as "already recorded".
    expect(otherErrors).toEqual([]);
    expect(await db.collection(COLLECTION).countDocuments()).toBe(1);
  });

  it('refuses to build the index while duplicates exist', async () => {
    // Why scripts/dedupe-telemetry-readings.ts has to run first, and why
    // ensureIndexes reports this failure loudly instead of swallowing it.
    const dup = {
      tenantId: 'tenant-a',
      vehicleId: 'v1',
      deviceId: 'd1',
      timestamp: new Date('2026-08-20T09:00:00Z'),
    };
    await db.collection(COLLECTION).insertMany([dup, { ...dup }]);

    await expect(createIndex()).rejects.toThrow();
  });
});

describeWithMongo('Phase 5: the workflow idempotency index is PARTIAL', () => {
  const COLLECTION = 'tblworkflow_instances';

  async function createIndex() {
    await db.collection(COLLECTION).createIndex(
      { tenantId: 1, idempotencyKey: 1 },
      {
        name: 'uniq_winstance_tenant_idempotency',
        unique: true,
        partialFilterExpression: { idempotencyKey: { $exists: true } },
      }
    );
  }

  it('collapses concurrent starts sharing an idempotency key', async () => {
    // Under Phase 3's at-least-once delivery a redelivered event calls
    // startWorkflow again. Without this, a second approval instance
    // appears for the same expense: two managers asked to approve one
    // thing.
    await createIndex();

    const { fulfilled, duplicateKeyErrors } = await race(8, () =>
      db.collection(COLLECTION).insertOne({
        tenantId: 'tenant-a',
        workflowId: 'wf-1',
        idempotencyKey: 'event:abc',
      })
    );

    expect(fulfilled).toHaveLength(1);
    expect(duplicateKeyErrors).toBe(7);
  });

  it('allows MANY instances with no key -- the manual-start case', async () => {
    // The reason the index is partial. A plain unique index would
    // collapse every keyless instance in a tenant into one and break
    // manual starts entirely, and a person may legitimately raise two
    // approvals for the same entity.
    await createIndex();

    await db.collection(COLLECTION).insertMany([
      { tenantId: 'tenant-a', workflowId: 'wf-1' },
      { tenantId: 'tenant-a', workflowId: 'wf-1' },
      { tenantId: 'tenant-a', workflowId: 'wf-1' },
    ]);

    expect(await db.collection(COLLECTION).countDocuments()).toBe(3);
  });

  it('scopes uniqueness per tenant', async () => {
    await createIndex();

    await db.collection(COLLECTION).insertMany([
      { tenantId: 'tenant-a', idempotencyKey: 'event:abc' },
      { tenantId: 'tenant-b', idempotencyKey: 'event:abc' },
    ]);

    expect(await db.collection(COLLECTION).countDocuments()).toBe(2);
  });
});

describeWithMongo('Phase 6: the allocation posting index is PARTIAL', () => {
  const COLLECTION = 'tblallocationledger';

  async function createIndex() {
    await db.collection(COLLECTION).createIndex(
      { tenantId: 1, idempotencyKey: 1 },
      {
        name: 'uniq_allocationledger_tenant_idempotency',
        unique: true,
        partialFilterExpression: { idempotencyKey: { $exists: true } },
      }
    );
  }

  it('posts a redelivered transaction exactly once', async () => {
    // This ledger is APPEND-ONLY, so a double posting cannot be edited
    // away -- the only remedy is a reversing posting, which needs a
    // human to first notice a plausible-looking number.
    await createIndex();

    const { fulfilled, duplicateKeyErrors } = await race(6, () =>
      db.collection(COLLECTION).insertOne({
        tenantId: 'tenant-a',
        sourceCollection: 'tblexpenses',
        sourceId: 'exp-1',
        amount: 400,
        idempotencyKey: 'abc123',
      })
    );

    expect(fulfilled).toHaveLength(1);
    expect(duplicateKeyErrors).toBe(5);

    const total = await db
      .collection(COLLECTION)
      .aggregate([{ $group: { _id: null, sum: { $sum: '$amount' } } }])
      .toArray();
    // The number that would have been wrong: 400, not 2400.
    expect(total[0].sum).toBe(400);
  });

  it('still allows manual postings, which carry no key', async () => {
    await createIndex();

    await db.collection(COLLECTION).insertMany([
      { tenantId: 'tenant-a', amount: 100 },
      { tenantId: 'tenant-a', amount: 100 },
    ]);

    expect(await db.collection(COLLECTION).countDocuments()).toBe(2);
  });
});

describeWithMongo('Phase 3: outbox claim, lease and retry', () => {
  const COLLECTION = 'tbloutbox_events';

  async function seed(rows: Record<string, unknown>[]) {
    await db.collection(COLLECTION).insertMany(rows as never);
  }

  /** The real claim filter from OutboxRepository.claimBatch. */
  async function claim(leaseOwner: string, leaseMs = 30_000) {
    const now = new Date();
    return db.collection(COLLECTION).findOneAndUpdate(
      {
        isDeleted: { $ne: true },
        $or: [
          {
            status: 'pending',
            $and: [
              { $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }] },
              { $or: [{ scheduledAt: { $exists: false } }, { scheduledAt: { $lte: now } }] },
            ],
          },
          { status: 'processing', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'processing',
          leaseOwner,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
        },
      },
      { sort: { createdAt: 1 }, returnDocument: 'after' }
    );
  }

  it('gives a row to EXACTLY ONE of many concurrent processors', async () => {
    // The assertion Phase 3 explicitly deferred: "does not prove Mongo's
    // findOneAndUpdate is atomic under real concurrency, because the
    // fake serialises everything".
    await db.collection(COLLECTION).createIndex({ eventId: 1 }, { unique: true });
    await seed([
      { eventId: 'e1', status: 'pending', attempts: 0, createdAt: new Date() },
    ]);

    const { fulfilled } = await race(10, (i) => claim(`processor-${i}`));
    const winners = fulfilled.filter((r) => r !== null);

    expect(winners).toHaveLength(1);
  });

  it('does NOT reclaim a row whose lease is still valid', async () => {
    await seed([
      {
        eventId: 'e1',
        status: 'processing',
        leaseOwner: 'processor-1',
        leaseExpiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      },
    ]);

    expect(await claim('processor-2')).toBeNull();
  });

  it('RECLAIMS a row whose lease expired -- the crash-recovery path', async () => {
    // A processor that died mid-dispatch must not strand an event
    // forever; its claim simply times out.
    await seed([
      {
        eventId: 'e1',
        status: 'processing',
        leaseOwner: 'dead-processor',
        leaseExpiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      },
    ]);

    const claimed = await claim('processor-2');
    expect(claimed).not.toBeNull();
    expect(claimed!.leaseOwner).toBe('processor-2');
  });

  it('does not claim a row whose retry is still in the future', async () => {
    // Exponential backoff: without this a failing handler is retried on
    // every poll, turning one downstream outage into a self-inflicted
    // load test.
    await seed([
      {
        eventId: 'e1',
        status: 'pending',
        nextAttemptAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      },
    ]);

    expect(await claim('processor-1')).toBeNull();
  });

  it('claims oldest first', async () => {
    // An outbox is a queue: delivering a newer event before an older one
    // for the same aggregate is how a projection applies updates out of
    // order.
    await seed([
      { eventId: 'newer', status: 'pending', createdAt: new Date('2026-08-20T10:00:00Z') },
      { eventId: 'older', status: 'pending', createdAt: new Date('2026-08-20T08:00:00Z') },
    ]);

    const claimed = await claim('processor-1');
    expect(claimed!.eventId).toBe('older');
  });

  it('rejects a duplicate eventId', async () => {
    await db.collection(COLLECTION).createIndex({ eventId: 1 }, { unique: true });

    const { fulfilled, duplicateKeyErrors } = await race(5, () =>
      db.collection(COLLECTION).insertOne({ eventId: 'e1', status: 'pending' })
    );

    expect(fulfilled).toHaveLength(1);
    expect(duplicateKeyErrors).toBe(4);
  });
});

describeWithMongo('Tenant scope is enforced by the query, not by convention', () => {
  const COLLECTION = 'tblvehicles';

  beforeEach(async () => {
    await db.collection(COLLECTION).insertMany([
      { tenantId: 'tenant-a', orgUnitId: 'unit-harare', license_plate: 'AAA111', isDeleted: false },
      { tenantId: 'tenant-a', orgUnitId: 'unit-bulawayo', license_plate: 'BBB222', isDeleted: false },
      { tenantId: 'tenant-b', orgUnitId: 'unit-other', license_plate: 'CCC333', isDeleted: false },
      { tenantId: 'tenant-a', orgUnitId: 'unit-harare', license_plate: 'DDD444', isDeleted: true },
    ] as never);
  });

  it('a tenant-scoped read never returns another tenant row', async () => {
    const rows = await db
      .collection(COLLECTION)
      .find({ tenantId: 'tenant-a', isDeleted: { $ne: true } })
      .toArray();

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tenantId === 'tenant-a')).toBe(true);
  });

  it('an org-unit predicate narrows within the tenant', async () => {
    const rows = await db
      .collection(COLLECTION)
      .find({
        tenantId: 'tenant-a',
        isDeleted: { $ne: true },
        orgUnitId: { $in: ['unit-harare'] },
      })
      .toArray();

    expect(rows).toHaveLength(1);
    expect(rows[0].license_plate).toBe('AAA111');
  });

  it('a caller-supplied tenantId CANNOT widen the scope when spread last', async () => {
    // The Phase 0 discipline, proven against a real query planner rather
    // than reasoned about: the scope predicate is spread AFTER the
    // caller's filter, so a forged tenantId in the caller's object is
    // overwritten rather than honoured.
    const callerFilter = { tenantId: 'tenant-b' };
    const scope = { tenantId: 'tenant-a' };

    const rows = await db
      .collection(COLLECTION)
      .find({ ...callerFilter, ...scope, isDeleted: { $ne: true } })
      .toArray();

    expect(rows.every((r) => r.tenantId === 'tenant-a')).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('shows what the WRONG spread order would have done', async () => {
    // Kept deliberately: this is the bug the ordering prevents, and
    // seeing it fail here is more convincing than a comment claiming it
    // would.
    const callerFilter = { tenantId: 'tenant-b' };
    const scope = { tenantId: 'tenant-a' };

    const rows = await db
      .collection(COLLECTION)
      .find({ ...scope, ...callerFilter, isDeleted: { $ne: true } })
      .toArray();

    // The caller won. This is the cross-tenant read.
    expect(rows.every((r) => r.tenantId === 'tenant-b')).toBe(true);
  });

  it('soft-deleted rows stay out of scoped reads', async () => {
    const rows = await db
      .collection(COLLECTION)
      .find({ tenantId: 'tenant-a', isDeleted: { $ne: true } })
      .toArray();

    expect(rows.map((r) => r.license_plate)).not.toContain('DDD444');
  });

  it('a partial unique index permits plate reuse after soft deletion', async () => {
    // The vehicles index from indexes.ts. Without the partial filter, a
    // deleted vehicle would block its plate forever.
    await db
      .collection(COLLECTION)
      .createIndex(
        { tenantId: 1, license_plate: 1 },
        { unique: true, partialFilterExpression: { isDeleted: false } }
      );

    // DDD444 exists but is soft-deleted, so the plate is reusable.
    await db
      .collection(COLLECTION)
      .insertOne({ tenantId: 'tenant-a', license_plate: 'DDD444', isDeleted: false } as never);

    // A live duplicate is still refused.
    await expect(
      db
        .collection(COLLECTION)
        .insertOne({ tenantId: 'tenant-a', license_plate: 'AAA111', isDeleted: false } as never)
    ).rejects.toMatchObject({ code: 11000 });
  });
});
