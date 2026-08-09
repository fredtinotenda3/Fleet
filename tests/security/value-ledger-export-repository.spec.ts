// tests/security/value-ledger-export-repository.spec.ts
//
// Proves ValueLedgerRepository.getFilteredEntriesForExport() -- the new
// Step 3 read path -- actually applies both scope layers (tenantId,
// then org-unit) rather than trusting the caller's TenantContext by
// name only, and that its cap/truncation bookkeeping is correct. Runs
// against the same in-memory FakeCollection the other repository
// suites use, exercising the REAL repository logic.
//
// Complements tests/security/ledger-export-scope.spec.ts, which mocks
// this method to test the SERVICE layer above it; this file is the one
// that actually proves the query the repository builds is correct.

import { ValueLedgerRepository } from '../../modules/attention/repositories/value-ledger.repository';
import { FakeCollection } from '../helpers/fake-collection';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import type { ValueLedgerEntry } from '../../modules/attention/types/value-ledger.types';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const OTHER_TENANT = 'another-org-abc123';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';

const collection = new FakeCollection();

class TestValueLedgerRepository extends ValueLedgerRepository {
  protected async getCollection(): Promise<any> {
    return collection as unknown as any;
  }
}

const repo = new TestValueLedgerRepository();

function makeContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    isPlatformScope: false,
  } as TenantContext;
}

function seedEntry(overrides: Partial<ValueLedgerEntry> = {}): void {
  collection.docs.push({
    _id: `id-${collection.docs.length + 1}`,
    tenantId: TENANT,
    orgUnitId: HARARE_BRANCH,
    attentionItemKey: 'fuel_fraud:alert-1',
    source: 'fuel_fraud',
    baselineTier: 'T2',
    modelledAmount: 100,
    realisedAmount: 100,
    evidenceRefs: ['receipt-1'],
    resolvedBy: 'user-1',
    resolvedAt: new Date('2026-08-01T00:00:00.000Z'),
    isDeleted: false,
    ...overrides,
  } as any);
}

beforeEach(() => {
  collection.docs = [];
  collection.seenFilters = [];
});

describe('ValueLedgerRepository.getFilteredEntriesForExport', () => {
  it('returns only rows scoped to the given tenant', async () => {
    seedEntry({ tenantId: TENANT });
    seedEntry({ tenantId: OTHER_TENANT });

    const result = await repo.getFilteredEntriesForExport({}, makeContext(null));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tenantId).toBe(TENANT);
    expect(result.totalMatched).toBe(1);
  });

  it('within one tenant, further narrows to the caller accessible org units', async () => {
    seedEntry({ orgUnitId: HARARE_BRANCH });
    seedEntry({ orgUnitId: BULAWAYO_BRANCH });

    const result = await repo.getFilteredEntriesForExport({}, makeContext([HARARE_BRANCH]));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].orgUnitId).toBe(HARARE_BRANCH);
  });

  it('an org-wide caller (accessibleOrgUnitIds === null) sees every org unit within the tenant', async () => {
    seedEntry({ orgUnitId: HARARE_BRANCH });
    seedEntry({ orgUnitId: BULAWAYO_BRANCH });

    const result = await repo.getFilteredEntriesForExport({}, makeContext(null));

    expect(result.rows).toHaveLength(2);
  });

  it('a scoped caller with no accessible org units (fail-closed) sees nothing', async () => {
    seedEntry({ orgUnitId: HARARE_BRANCH });

    const result = await repo.getFilteredEntriesForExport({}, makeContext([]));

    expect(result.rows).toHaveLength(0);
    expect(result.totalMatched).toBe(0);
  });

  it('filters by source when supplied', async () => {
    seedEntry({ source: 'fuel_fraud', attentionItemKey: 'fuel_fraud:alert-1' });
    seedEntry({ source: 'expense_anomaly', attentionItemKey: 'expense_anomaly:exp-1' });

    const result = await repo.getFilteredEntriesForExport({ source: 'expense_anomaly' }, makeContext(null));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].source).toBe('expense_anomaly');
  });

  it('excludes soft-deleted rows, matching every other repository read', async () => {
    seedEntry({ isDeleted: true } as any);
    seedEntry({ isDeleted: false } as any);

    const result = await repo.getFilteredEntriesForExport({}, makeContext(null));

    expect(result.rows).toHaveLength(1);
  });

  it('respects a caller-supplied cap and reports truncated when totalMatched exceeds it', async () => {
    seedEntry();
    seedEntry();
    seedEntry();

    const result = await repo.getFilteredEntriesForExport({}, makeContext(null), 2);

    expect(result.rows).toHaveLength(2);
    expect(result.totalMatched).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.exportCap).toBe(2);
  });

  it('is not truncated when every matching row fits within the cap', async () => {
    seedEntry();
    seedEntry();

    const result = await repo.getFilteredEntriesForExport({}, makeContext(null), 50_000);

    expect(result.rows).toHaveLength(2);
    expect(result.totalMatched).toBe(2);
    expect(result.truncated).toBe(false);
  });
});
