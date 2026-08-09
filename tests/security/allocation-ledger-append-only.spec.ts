// tests/security/allocation-ledger-append-only.spec.ts
//
// Proves the three properties the cost-per-km engine's credibility rests
// on:
//
//   1. IMMUTABILITY. AllocationLedgerRepository is append-only by
//      construction, not convention -- update/softDelete/hardDelete are
//      overridden to throw, so a future call site reaching for the
//      inherited BaseRepository method (an unremarkable-looking mistake:
//      every other repository has those methods) fails loudly at the
//      call rather than silently restating a financial figure in
//      production.
//
//   2. NETTING. A reversing posting carries the equal-and-opposite
//      reportingAmount, so summing includes it like any other posting and
//      a reversed cost nets to zero WITHOUT disappearing. Both the
//      original error and its correction stay visible. This is asserted
//      through the real getNetTotalsByCategory aggregation rather than a
//      mock, which is why tests/helpers/fake-collection.ts gained a
//      minimal $match/$group/$sum aggregate in this pass.
//
//   3. SCOPING. Every read applies BOTH tenant scope and org-unit scope.
//      A branch-scoped caller must not see, total, or discover reversals
//      of another branch's postings.
//
// Runs against the same in-memory FakeCollection as the other suites,
// exercising the REAL repository logic.

import { AllocationLedgerRepository } from '../../modules/finance/repositories/allocation-ledger.repository';
import { FakeCollection } from '../helpers/fake-collection';
import type { AllocationPosting } from '../../modules/finance/types/allocation.types';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const OTHER_TENANT = 'toyota-zimbabwe-63078f';
const HARARE = 'unit-harare';
const BULAWAYO = 'unit-bulawayo';

const collection = new FakeCollection();

class TestAllocationLedgerRepository extends AllocationLedgerRepository {
  protected async getCollection(): Promise<any> {
    return collection as unknown as any;
  }
}

const repo = new TestAllocationLedgerRepository();

function contextFor(
  organizationId: string,
  accessibleOrgUnitIds: string[] | null
): TenantContext {
  return {
    organizationId,
    organizationName: 'Test Org',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

type AppendInput = Omit<
  AllocationPosting,
  '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'createdBy' | 'updatedBy'
>;

const PERIOD_START = new Date('2026-07-01T00:00:00.000Z');
const PERIOD_END = new Date('2026-07-31T23:59:59.000Z');

function makePosting(overrides: Partial<AppendInput> = {}): AppendInput {
  return {
    orgUnitId: HARARE,
    vehicleId: '507f1f77bcf86cd799439011',
    costCategory: 'fuel',
    allocationRule: 'direct',
    sourceCollection: 'tblfuellogs',
    sourceId: 'fuel-log-1',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    currency: 'USD',
    amount: 400,
    fxRate: 1,
    fxRateDate: PERIOD_START,
    fxSource: 'organization-default',
    reportingCurrency: 'USD',
    reportingAmount: 400,
    glAccountCode: '5100',
    postedBy: 'user-1',
    postedAt: new Date('2026-07-15T10:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  collection.docs = [];
  collection.seenFilters = [];
});

describe('AllocationLedgerRepository -- append-only, immutable', () => {
  it('append() writes a posting with its audit fields and tenant', async () => {
    const posting = await repo.append(makePosting(), TENANT, 'user-1');

    expect(posting._id).toBeDefined();
    expect(posting.tenantId).toBe(TENANT);
    expect(posting.reportingAmount).toBe(400);
    expect(posting.isDeleted).toBe(false);
    expect(collection.docs).toHaveLength(1);
  });

  it('update() throws ConflictError and never touches the collection', async () => {
    await repo.append(makePosting(), TENANT, 'user-1');
    const before = JSON.stringify(collection.docs);

    await expect(repo.update()).rejects.toThrow(
      'tblallocationledger is append-only: postings cannot be updated once written.'
    );
    expect(JSON.stringify(collection.docs)).toBe(before);
  });

  it('softDelete() and hardDelete() throw and never touch the collection', async () => {
    await repo.append(makePosting(), TENANT, 'user-1');
    const before = JSON.stringify(collection.docs);

    await expect(repo.softDelete()).rejects.toThrow(
      'tblallocationledger is append-only: postings cannot be deleted.'
    );
    await expect(repo.hardDelete()).rejects.toThrow(
      'tblallocationledger is append-only: postings cannot be deleted.'
    );
    expect(JSON.stringify(collection.docs)).toBe(before);
  });

  it('the thrown errors are ConflictError instances (409), not generic errors', async () => {
    const { ConflictError } = await import('../../server/errors/app.errors');

    await expect(repo.update()).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.softDelete()).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.hardDelete()).rejects.toBeInstanceOf(ConflictError);
  });

  it('a second append for the same sourceId adds a row rather than merging', async () => {
    await repo.append(makePosting(), TENANT, 'user-1');
    await repo.append(makePosting({ amount: 50, reportingAmount: 50 }), TENANT, 'user-2');

    expect(collection.docs).toHaveLength(2);
    expect(collection.docs[0].reportingAmount).toBe(400);
    expect(collection.docs[1].reportingAmount).toBe(50);
  });
});

describe('reversal nets to zero without erasing history', () => {
  it('an original plus its reversal sum to zero while both rows remain', async () => {
    const original = await repo.append(makePosting(), TENANT, 'user-1');
    await repo.append(
      makePosting({
        amount: -400,
        reportingAmount: -400,
        reversalOfPostingId: String(original._id),
        reversalReason: 'Posted against the wrong vehicle',
      }),
      TENANT,
      'user-2'
    );

    const totals = await repo.getNetTotalsByCategory(
      '507f1f77bcf86cd799439011',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, null)
    );

    expect(totals).toHaveLength(1);
    expect(totals[0].costCategory).toBe('fuel');
    expect(totals[0].netReportingAmount).toBe(0);
    // Two postings counted, not one: the correction is evidence too.
    expect(totals[0].postingCount).toBe(2);
    expect(collection.docs).toHaveLength(2);
  });

  it('a partial reversal leaves the remaining balance, not zero', async () => {
    const original = await repo.append(makePosting(), TENANT, 'user-1');
    await repo.append(
      makePosting({
        amount: -150,
        reportingAmount: -150,
        reversalOfPostingId: String(original._id),
        reversalReason: 'Partial credit note from the supplier',
      }),
      TENANT,
      'user-2'
    );

    const totals = await repo.getNetTotalsByCategory(
      '507f1f77bcf86cd799439011',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, null)
    );

    expect(totals[0].netReportingAmount).toBe(250);
  });

  it('findReversalOf() discovers a reversal by query, never by a flag on the original', async () => {
    const original = await repo.append(makePosting(), TENANT, 'user-1');
    const context = contextFor(TENANT, null);

    expect(await repo.findReversalOf(String(original._id), context)).toBeNull();

    await repo.append(
      makePosting({
        amount: -400,
        reportingAmount: -400,
        reversalOfPostingId: String(original._id),
        reversalReason: 'Duplicate of fuel-log-1',
      }),
      TENANT,
      'user-2'
    );

    const found = await repo.findReversalOf(String(original._id), context);
    expect(found).not.toBeNull();
    expect(found!.reversalOfPostingId).toBe(String(original._id));
    // The original row itself was never mutated to record that it was reversed.
    const originalRow = collection.docs.find((d) => String(d._id) === String(original._id))!;
    expect(originalRow.reversalOfPostingId).toBeUndefined();
  });
});

describe('scoping -- tenant AND org unit, on every read path', () => {
  it('getNetTotalsByCategory excludes another tenant\'s postings', async () => {
    await repo.append(makePosting(), TENANT, 'user-1');
    await repo.append(makePosting({ amount: 9999, reportingAmount: 9999 }), OTHER_TENANT, 'user-x');

    const totals = await repo.getNetTotalsByCategory(
      '507f1f77bcf86cd799439011',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, null)
    );

    expect(totals).toHaveLength(1);
    expect(totals[0].netReportingAmount).toBe(400);
  });

  it('getNetTotalsByCategory excludes org units outside the caller\'s scope', async () => {
    await repo.append(makePosting({ orgUnitId: HARARE }), TENANT, 'user-1');
    await repo.append(
      makePosting({ orgUnitId: BULAWAYO, amount: 700, reportingAmount: 700 }),
      TENANT,
      'user-2'
    );

    const harareOnly = await repo.getNetTotalsByCategory(
      '507f1f77bcf86cd799439011',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, [HARARE])
    );
    expect(harareOnly[0].netReportingAmount).toBe(400);

    const both = await repo.getNetTotalsByCategory(
      '507f1f77bcf86cd799439011',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, [HARARE, BULAWAYO])
    );
    expect(both[0].netReportingAmount).toBe(1100);
  });

  it('fails closed: an empty accessible-unit set totals nothing', async () => {
    await repo.append(makePosting({ orgUnitId: HARARE }), TENANT, 'user-1');

    const totals = await repo.getNetTotalsByCategory(
      '507f1f77bcf86cd799439011',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, [])
    );

    expect(totals).toEqual([]);
  });

  it('getNetTotalsByGlAccount applies the same two scope layers', async () => {
    await repo.append(makePosting({ orgUnitId: HARARE, glAccountCode: '5100' }), TENANT, 'u1');
    await repo.append(
      makePosting({
        orgUnitId: BULAWAYO,
        glAccountCode: '5100',
        amount: 700,
        reportingAmount: 700,
      }),
      TENANT,
      'u2'
    );
    await repo.append(
      makePosting({ orgUnitId: HARARE, glAccountCode: '5100', amount: 1, reportingAmount: 1 }),
      OTHER_TENANT,
      'ux'
    );

    const rows = await repo.getNetTotalsByGlAccount(
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, [HARARE])
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].glAccountCode).toBe('5100');
    expect(rows[0].netReportingAmount).toBe(400);
  });

  it('findByVehicleInScope excludes out-of-scope org units', async () => {
    await repo.append(makePosting({ orgUnitId: HARARE }), TENANT, 'u1');
    await repo.append(makePosting({ orgUnitId: BULAWAYO }), TENANT, 'u2');

    const results = await repo.findByVehicleInScope(
      '507f1f77bcf86cd799439011',
      contextFor(TENANT, [HARARE])
    );

    expect(results).toHaveLength(1);
    expect(results[0].orgUnitId).toBe(HARARE);
  });

  it('findReversalOf cannot discover a reversal in another org unit', async () => {
    const original = await repo.append(makePosting({ orgUnitId: BULAWAYO }), TENANT, 'u1');
    await repo.append(
      makePosting({
        orgUnitId: BULAWAYO,
        amount: -400,
        reportingAmount: -400,
        reversalOfPostingId: String(original._id),
        reversalReason: 'Bulawayo correction',
      }),
      TENANT,
      'u2'
    );

    // A Harare-scoped caller must not learn that a Bulawayo posting was
    // reversed -- that would leak the existence of another branch's
    // financial correction.
    const asHarare = await repo.findReversalOf(String(original._id), contextFor(TENANT, [HARARE]));
    expect(asHarare).toBeNull();

    const asBulawayo = await repo.findReversalOf(
      String(original._id),
      contextFor(TENANT, [BULAWAYO])
    );
    expect(asBulawayo).not.toBeNull();
  });

  it('every totals query carries both an isDeleted guard and the org-unit predicate', async () => {
    await repo.append(makePosting(), TENANT, 'u1');
    collection.seenFilters = [];

    await repo.getNetTotalsByCategory(
      '507f1f77bcf86cd799439011',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, [HARARE])
    );

    const filter = collection.lastFilter();
    expect(filter.tenantId).toBe(TENANT);
    expect(filter.isDeleted).toEqual({ $ne: true });
    // The scope predicate must be present as a key the caller cannot have
    // overridden -- the filter-spread-order bug class from Phase F.
    expect(filter.orgUnitId).toEqual({ $in: [HARARE] });
  });
});
