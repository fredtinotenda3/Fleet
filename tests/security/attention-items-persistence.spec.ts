// tests/security/attention-items-persistence.spec.ts
//
// Proves the property STEP 1 of the attention-queue backlog item exists
// for: needsAttentionService.getFeed() upserts its live results into
// attention_items, and doing so repeatedly (every refresh) never
// produces duplicate rows for the same item -- it updates the existing
// row in place, keyed on {tenantId, itemKey}.
//
// Runs against the same in-memory FakeCollection the tenant-isolation
// suite uses (tests/helpers/fake-collection.ts), exercising the REAL
// AttentionItemRepository.upsertFeedItems() bulkWrite logic rather than
// mocking the repository itself.

import { AttentionItemRepository } from '../../modules/attention/repositories/attention-item.repository';
import { FakeCollection } from '../helpers/fake-collection';
import type { NeedsAttentionItem } from '../../modules/ai/types/needs-attention.types';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';

const collection = new FakeCollection();

class TestAttentionItemRepository extends AttentionItemRepository {
  protected async getCollection(): Promise<any> {
    return collection as unknown as any;
  }
}

const repo = new TestAttentionItemRepository();

function makeItem(overrides: Partial<NeedsAttentionItem> = {}): NeedsAttentionItem {
  return {
    id: 'fuel_fraud:alert-1',
    source: 'fuel_fraud',
    severity: 'high',
    urgency: 'soon',
    title: 'Possible fuel fraud: HRE1234',
    description: 'Unusual cost deviation on last fill-up',
    cost: 250,
    priorityScore: 100,
    entityId: 'vehicle-1',
    entityLabel: 'HRE1234',
    ...overrides,
  };
}

beforeEach(() => {
  collection.docs = [];
  collection.seenFilters = [];
});

describe('AttentionItemRepository.upsertFeedItems', () => {
  it('inserts a new row on first upsert', async () => {
    const result = await repo.upsertFeedItems(TENANT, [makeItem()], 'branch-harare');

    expect(result.upsertedCount).toBe(1);
    expect(result.modifiedCount).toBe(0);
    expect(collection.docs).toHaveLength(1);
    expect(collection.docs[0]).toMatchObject({
      tenantId: TENANT,
      itemKey: 'fuel_fraud:alert-1',
      source: 'fuel_fraud',
      orgUnitId: 'branch-harare',
    });
    expect(collection.docs[0].firstSeenAt).toBeInstanceOf(Date);
    expect(collection.docs[0].lastSeenAt).toBeInstanceOf(Date);
  });

  it('is idempotent: refreshing the same item again updates the row instead of inserting a duplicate', async () => {
    await repo.upsertFeedItems(TENANT, [makeItem()], 'branch-harare');
    const firstSeenAt = collection.docs[0].firstSeenAt;

    // Simulate a later refresh where the underlying condition worsened.
    await repo.upsertFeedItems(
      TENANT,
      [makeItem({ severity: 'critical', priorityScore: 175, cost: 900 })],
      'branch-harare'
    );

    expect(collection.docs).toHaveLength(1);
    expect(collection.docs[0].severity).toBe('critical');
    expect(collection.docs[0].priorityScore).toBe(175);
    // firstSeenAt must never move on a later refresh.
    expect(collection.docs[0].firstSeenAt).toBe(firstSeenAt);
  });

  it('produces no duplicate rows across many refreshes of the same feed', async () => {
    const feed = [
      makeItem({ id: 'fuel_fraud:alert-1' }),
      makeItem({ id: 'driver_risk:driver-9', source: 'driver_risk' }),
      makeItem({ id: 'maintenance:reminder-3', source: 'maintenance' }),
    ];

    for (let refresh = 0; refresh < 5; refresh++) {
      await repo.upsertFeedItems(TENANT, feed, 'branch-harare');
    }

    expect(collection.docs).toHaveLength(3);
    const itemKeys = collection.docs.map((d) => d.itemKey).sort();
    expect(itemKeys).toEqual(
      ['driver_risk:driver-9', 'fuel_fraud:alert-1', 'maintenance:reminder-3'].sort()
    );
  });

  it('scopes rows to tenantId: two tenants with the same itemKey do not collide', async () => {
    await repo.upsertFeedItems(TENANT, [makeItem()], 'branch-harare');
    await repo.upsertFeedItems('another-org-abc123', [makeItem()], 'branch-bulawayo');

    expect(collection.docs).toHaveLength(2);
    expect(new Set(collection.docs.map((d) => d.tenantId)).size).toBe(2);
  });

  it('an empty feed is a no-op and never touches the collection', async () => {
    const result = await repo.upsertFeedItems(TENANT, [], 'branch-harare');

    expect(result).toEqual({ upsertedCount: 0, modifiedCount: 0, matchedCount: 0 });
    expect(collection.docs).toHaveLength(0);
  });

  it('when a source stops reporting an item it disappears from a fresh feed but the previously-persisted row is left as-is (no deletion in this pass)', async () => {
    await repo.upsertFeedItems(
      TENANT,
      [makeItem({ id: 'fuel_fraud:alert-1' }), makeItem({ id: 'fuel_fraud:alert-2' })],
      'branch-harare'
    );
    expect(collection.docs).toHaveLength(2);

    // alert-2's underlying condition cleared; the next feed no longer contains it.
    await repo.upsertFeedItems(TENANT, [makeItem({ id: 'fuel_fraud:alert-1' })], 'branch-harare');

    // Known, documented limitation of this pass (see attention-item.types.ts):
    // stale rows are not pruned yet, so the row count is unchanged.
    expect(collection.docs).toHaveLength(2);
  });
});
