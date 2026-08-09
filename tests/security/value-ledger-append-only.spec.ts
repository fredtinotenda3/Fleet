// tests/security/value-ledger-append-only.spec.ts
//
// Proves the property STEP 2 of the attention-queue backlog item exists
// for: ValueLedgerRepository is append-only BY CONSTRUCTION, not just by
// convention. update()/softDelete()/hardDelete() are overridden to throw
// ConflictError rather than silently permit a write that would let a
// posting be edited or removed after the fact -- see the file header on
// value-ledger.repository.ts. append() is the sole write path, and a
// second append() for the same attentionItemKey creates a second, wholly
// separate row rather than merging into or overwriting the first (unlike
// AttentionItemRepository.upsertFeedItems(), which is upsert-in-place by
// design -- the ledger is deliberately the opposite).
//
// Runs against the same in-memory FakeCollection the persistence and
// tenant-isolation suites use (tests/helpers/fake-collection.ts),
// exercising the REAL ValueLedgerRepository logic rather than mocking
// the repository itself.

import { ValueLedgerRepository } from '../../modules/attention/repositories/value-ledger.repository';
import { FakeCollection } from '../helpers/fake-collection';
import type { ValueLedgerEntry } from '../../modules/attention/types/value-ledger.types';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const OTHER_TENANT = 'another-org-abc123';

const collection = new FakeCollection();

class TestValueLedgerRepository extends ValueLedgerRepository {
  protected async getCollection(): Promise<any> {
    return collection as unknown as any;
  }
}

const repo = new TestValueLedgerRepository();

type AppendInput = Omit<
  ValueLedgerEntry,
  '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'createdBy' | 'updatedBy'
>;

function makeEntry(overrides: Partial<AppendInput> = {}): AppendInput {
  return {
    orgUnitId: 'branch-harare',
    attentionItemKey: 'fuel_fraud:alert-1',
    source: 'fuel_fraud',
    baselineTier: 'T2',
    modelledAmount: 250,
    realisedAmount: 250,
    evidenceRefs: ['receipt-9981'],
    notes: undefined,
    resolvedBy: 'user-1',
    resolvedAt: new Date('2026-08-01T10:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  collection.docs = [];
  collection.seenFilters = [];
});

describe('ValueLedgerRepository -- append-only, immutable', () => {
  describe('append()', () => {
    it('inserts a new posting with all supplied fields plus audit fields', async () => {
      const entry = await repo.append(makeEntry(), TENANT, 'user-1');

      expect(entry._id).toBeDefined();
      expect(entry.tenantId).toBe(TENANT);
      expect(entry.attentionItemKey).toBe('fuel_fraud:alert-1');
      expect(entry.source).toBe('fuel_fraud');
      expect(entry.baselineTier).toBe('T2');
      expect(entry.modelledAmount).toBe(250);
      expect(entry.realisedAmount).toBe(250);
      expect(entry.evidenceRefs).toEqual(['receipt-9981']);
      expect(entry.resolvedBy).toBe('user-1');
      expect(entry.isDeleted).toBe(false);
      expect(collection.docs).toHaveLength(1);
    });

    it('a second append for the same attentionItemKey creates a second row, not an update in place', async () => {
      // The repository does not enforce the one-posting-per-item rule
      // itself (that's the unique DB index + the service's "already
      // resolved" check upstream) -- at the repository layer, append()
      // has no update path at all, so calling it twice can only ever
      // add rows.
      await repo.append(makeEntry(), TENANT, 'user-1');
      await repo.append(
        makeEntry({ realisedAmount: 300, evidenceRefs: ['receipt-9982'] }),
        TENANT,
        'user-2'
      );

      expect(collection.docs).toHaveLength(2);
      const amounts = collection.docs.map((d) => d.realisedAmount).sort();
      expect(amounts).toEqual([250, 300]);
      // The first posting's data is untouched by the second append.
      expect(collection.docs[0].evidenceRefs).toEqual(['receipt-9981']);
      expect(collection.docs[0].resolvedBy).toBe('user-1');
    });

    it('scopes rows to tenantId', async () => {
      await repo.append(makeEntry(), TENANT, 'user-1');
      await repo.append(makeEntry(), OTHER_TENANT, 'user-1');

      expect(collection.docs).toHaveLength(2);
      expect(new Set(collection.docs.map((d) => d.tenantId)).size).toBe(2);
    });
  });

  describe('immutability -- update/softDelete/hardDelete all throw, none touch the collection', () => {
    it('update() throws ConflictError and never reaches the collection', async () => {
      await repo.append(makeEntry(), TENANT, 'user-1');
      const before = JSON.stringify(collection.docs);

      await expect(repo.update()).rejects.toThrow(
        'value_ledger is append-only: entries cannot be updated once written.'
      );
      expect(JSON.stringify(collection.docs)).toBe(before);
    });

    it('softDelete() throws ConflictError and never reaches the collection', async () => {
      await repo.append(makeEntry(), TENANT, 'user-1');
      const before = JSON.stringify(collection.docs);

      await expect(repo.softDelete()).rejects.toThrow(
        'value_ledger is append-only: entries cannot be deleted.'
      );
      expect(JSON.stringify(collection.docs)).toBe(before);
    });

    it('hardDelete() throws ConflictError and never reaches the collection', async () => {
      await repo.append(makeEntry(), TENANT, 'user-1');
      const before = JSON.stringify(collection.docs);

      await expect(repo.hardDelete()).rejects.toThrow(
        'value_ledger is append-only: entries cannot be deleted.'
      );
      expect(JSON.stringify(collection.docs)).toBe(before);
    });

    it('the thrown errors are ConflictError instances (409), not generic errors', async () => {
      const { ConflictError } = await import('../../server/errors/app.errors');

      await expect(repo.update()).rejects.toBeInstanceOf(ConflictError);
      await expect(repo.softDelete()).rejects.toBeInstanceOf(ConflictError);
      await expect(repo.hardDelete()).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('findByAttentionItemKeyInScope()', () => {
    it('returns only postings for the given attentionItemKey, scoped to tenant', async () => {
      await repo.append(makeEntry({ attentionItemKey: 'fuel_fraud:alert-1' }), TENANT, 'user-1');
      await repo.append(
        makeEntry({ attentionItemKey: 'expense_anomaly:exp-1', source: 'expense_anomaly' }),
        TENANT,
        'user-1'
      );
      await repo.append(makeEntry({ attentionItemKey: 'fuel_fraud:alert-1' }), OTHER_TENANT, 'user-1');

      const results = await repo.findByAttentionItemKeyInScope(TENANT, 'fuel_fraud:alert-1');

      expect(results).toHaveLength(1);
      expect(results[0].attentionItemKey).toBe('fuel_fraud:alert-1');
      expect(results[0].tenantId).toBe(TENANT);
    });

    it('reflects every posting when an item was resolved more than once (e.g. a correction), proving history is preserved rather than overwritten', async () => {
      await repo.append(
        makeEntry({
          attentionItemKey: 'fuel_fraud:alert-1',
          realisedAmount: 250,
          resolvedAt: new Date('2026-08-01T10:00:00.000Z'),
        }),
        TENANT,
        'user-1'
      );
      await repo.append(
        makeEntry({
          attentionItemKey: 'fuel_fraud:alert-1',
          realisedAmount: 275,
          notes: 'Correction after reviewing the fuel receipt.',
          resolvedAt: new Date('2026-08-02T10:00:00.000Z'),
        }),
        TENANT,
        'user-2'
      );

      const results = await repo.findByAttentionItemKeyInScope(TENANT, 'fuel_fraud:alert-1');

      expect(results).toHaveLength(2);
      const realisedAmounts = results.map((r) => r.realisedAmount).sort();
      expect(realisedAmounts).toEqual([250, 275]);
    });
  });
});
