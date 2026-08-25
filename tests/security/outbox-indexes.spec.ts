// tests/security/outbox-indexes.spec.ts
//
// PHASE 3 -- the outbox collection's indexes.
//
// `tbloutbox_events` had NO index definitions anywhere in
// infrastructure/database/. Survivable only because nothing ever wrote
// to it; now every domain event lands there and the claim query runs on
// every poll of every processor.
//
// Follows the structure of finance-indexes.spec.ts and
// telematics-indexes.spec.ts.

import * as fs from 'fs';
import * as path from 'path';

import { INDEXES } from '../../infrastructure/database/indexes';
import { OUTBOX_INDEXES } from '../../infrastructure/database/indexes.outbox-addendum';

const ROOT = path.resolve(__dirname, '../..');

type IndexDef = {
  key: Record<string, number>;
  name: string;
  unique?: boolean;
  expireAfterSeconds?: number;
};

const defs = (): IndexDef[] =>
  (OUTBOX_INDEXES as unknown as Record<string, IndexDef[]>).tbloutbox_events ?? [];

const byName = (name: string) => defs().find((d) => d.name === name);

describe('Phase 3: the outbox collection is indexed', () => {
  it('declares indexes for tbloutbox_events', () => {
    expect(defs().length).toBeGreaterThan(0);
  });

  it('is merged into the exported INDEXES map, not defined and forgotten', () => {
    expect((INDEXES as Record<string, unknown>).tbloutbox_events).toEqual(defs());
  });
});

describe('Phase 3: eventId is the unique idempotency key', () => {
  const IDX = 'uniq_outbox_event_id';

  it('exists and is unique', () => {
    // append() relies on this to collapse a duplicate publish: two
    // concurrent publishers racing on one event produce one row, and the
    // loser learns that from an 11000 rather than a read-then-write
    // check that could interleave. Without it, that race silently
    // produces two rows and the event is delivered twice.
    const def = byName(IDX);
    expect(def).toBeDefined();
    expect(def!.unique).toBe(true);
    expect(Object.keys(def!.key)).toEqual(['eventId']);
  });

  it('is deliberately NOT tenant-prefixed', () => {
    // An eventId is a UUID from DomainEvent's constructor, so it is
    // globally unique by construction, and the processor looks rows up
    // cross-tenant by eventId alone -- a tenant-prefixed unique index
    // would not constrain that lookup.
    expect(Object.keys(byName(IDX)!.key)).not.toContain('tenantId');
  });
});

describe('Phase 3: polling and recovery are indexed', () => {
  it('covers the claim query (status + nextAttemptAt + createdAt)', () => {
    // Without this, every poll of every processor is a collection scan
    // over a table that grows with every event the platform emits.
    const def = byName('idx_outbox_status_next_created');
    expect(def).toBeDefined();
    expect(Object.keys(def!.key)).toEqual(['status', 'nextAttemptAt', 'createdAt']);
  });

  it('covers stale-lease recovery (status + leaseExpiresAt)', () => {
    // The branch that rescues events from a processor that died
    // mid-dispatch. Its own index because leaseExpiresAt is not a prefix
    // of the claim key and the $or branches are planned independently.
    const def = byName('idx_outbox_status_lease');
    expect(def).toBeDefined();
    expect(Object.keys(def!.key)).toEqual(['status', 'leaseExpiresAt']);
  });

  it('covers the existing cleanup job', () => {
    // workers/cleanup.worker.ts deletes {processed: true, processedAt}
    // past a 7-day retention. That job predates Phase 3 and is left
    // working unchanged; this is the index it always needed.
    const def = byName('idx_outbox_processed_at');
    expect(def).toBeDefined();
    expect(Object.keys(def!.key)).toEqual(['processed', 'processedAt']);
  });

  it("covers a tenant's dead-letter queue, tenant-prefixed", () => {
    // getDeadLetteredForTenant is a SCOPED read reached from a request,
    // unlike the processor surface, so it is prefixed like every other
    // tenant-scoped index here.
    const def = byName('idx_outbox_tenant_status_deadlettered');
    expect(def).toBeDefined();
    expect(Object.keys(def!.key)[0]).toBe('tenantId');
  });
});

describe('Phase 3: structural soundness', () => {
  it('no index name is reused for a different key', () => {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];

    for (const list of Object.values(INDEXES as Record<string, IndexDef[]>)) {
      for (const def of list) {
        const spec = JSON.stringify(def.key);
        const prior = seen.get(def.name);
        if (prior === undefined) seen.set(def.name, spec);
        else if (prior !== spec) conflicts.push(def.name);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('the outbox declares no TTL — retention is the cleanup job', () => {
    // A TTL here would delete rows a processor might still be retrying.
    // Retention stays with the cleanup worker, which only removes rows
    // already marked processed.
    for (const def of defs()) {
      expect(def.expireAfterSeconds).toBeUndefined();
    }
  });

  it('the cleanup job still filters on the field Phase 3 maintains', () => {
    const src = fs.readFileSync(path.join(ROOT, 'workers/cleanup.worker.ts'), 'utf8');
    expect(src).toContain('processed: true');
  });
});
