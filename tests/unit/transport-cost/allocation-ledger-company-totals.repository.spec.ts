// tests/unit/transport-cost/allocation-ledger-company-totals.repository.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, item 2/3/4/10/11. Pins
// AllocationLedgerRepository.getNetTotalsByCompanyAcrossVehicles -- the
// aggregation TransportCostReportService.getAllocationReport's new
// `byCompany` breakdown is built from (see that repository method's own
// header comment for why the pipeline is a flat $group, not a
// $ifNull-folding one).
//
// Runs against the same in-memory FakeCollection as
// tests/security/allocation-ledger-append-only.spec.ts, exercising the
// REAL repository/aggregation logic rather than a mock -- netting and
// grouping behaviour lives in the pipeline, so mocking the repository
// would test the mock instead.

import { AllocationLedgerRepository } from '../../../modules/finance/repositories/allocation-ledger.repository';
import { FakeCollection } from '../../helpers/fake-collection';
import type { AllocationPosting } from '../../../modules/finance/types/allocation.types';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

const TENANT = 'olivine-group-4f2a1c';
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
    costCategory: 'third-party-transport',
    allocationRule: 'direct',
    sourceCollection: 'tbltransportcostsourcerecords',
    sourceId: 'source-1',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    currency: 'USD',
    amount: 4500,
    fxRate: 1,
    fxRateDate: PERIOD_START,
    fxSource: 'organization-default',
    reportingCurrency: 'USD',
    reportingAmount: 4500,
    postedBy: 'user-1',
    postedAt: new Date('2026-07-15T10:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  collection.docs = [];
  collection.seenFilters = [];
});

describe('AllocationLedgerRepository.getNetTotalsByCompanyAcrossVehicles', () => {
  it('groups net reporting amounts by costFacingCompany across every vehicle in scope', async () => {
    await repo.append(makePosting({ costFacingCompany: 'hypery', reportingAmount: 1000, amount: 1000 }), TENANT, 'u1');
    await repo.append(
      makePosting({ vehicleId: 'v2', costFacingCompany: 'hypery', reportingAmount: 500, amount: 500 }),
      TENANT,
      'u1'
    );
    await repo.append(makePosting({ costFacingCompany: 'olivine', reportingAmount: 2000, amount: 2000 }), TENANT, 'u2');
    await repo.append(makePosting({ costFacingCompany: 'surface', reportingAmount: 750, amount: 750 }), TENANT, 'u3');

    const rows = await repo.getNetTotalsByCompanyAcrossVehicles(
      'third-party-transport',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, null)
    );

    const byCompany = Object.fromEntries(rows.map((r) => [r.costFacingCompany, r.netReportingAmount]));
    expect(byCompany).toEqual({ hypery: 1500, olivine: 2000, surface: 750 });
  });

  it('groups a posting with no costFacingCompany under a null key rather than dropping or fabricating one', async () => {
    await repo.append(makePosting({ costFacingCompany: undefined, reportingAmount: 300, amount: 300 }), TENANT, 'u1');
    await repo.append(makePosting({ costFacingCompany: 'olivine', reportingAmount: 100, amount: 100 }), TENANT, 'u1');

    const rows = await repo.getNetTotalsByCompanyAcrossVehicles(
      'third-party-transport',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, null)
    );

    expect(rows).toHaveLength(2);
    const unattributed = rows.find((r) => r.costFacingCompany === null);
    expect(unattributed).toBeDefined();
    expect(unattributed!.netReportingAmount).toBe(300);
    expect(unattributed!.postingCount).toBe(1);
  });

  it('accepts an array of cost categories and sums across all of them (the transport-cost report reads third-party-transport AND transport-retainer)', async () => {
    await repo.append(
      makePosting({ costCategory: 'third-party-transport', costFacingCompany: 'hypery', reportingAmount: 400, amount: 400 }),
      TENANT,
      'u1'
    );
    await repo.append(
      makePosting({ costCategory: 'transport-retainer', costFacingCompany: 'hypery', reportingAmount: 600, amount: 600 }),
      TENANT,
      'u1'
    );
    await repo.append(
      makePosting({ costCategory: 'stock-transfer', costFacingCompany: 'hypery', reportingAmount: 9999, amount: 9999 }),
      TENANT,
      'u1'
    );

    const rows = await repo.getNetTotalsByCompanyAcrossVehicles(
      ['third-party-transport', 'transport-retainer'],
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, null)
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].netReportingAmount).toBe(1000);
  });

  it('a reversal nets its company total to zero while the posting count still reflects both rows', async () => {
    const original = await repo.append(
      makePosting({ costFacingCompany: 'olivine', reportingAmount: 4500, amount: 4500 }),
      TENANT,
      'u1'
    );
    await repo.append(
      makePosting({
        costFacingCompany: 'olivine',
        reportingAmount: -4500,
        amount: -4500,
        reversalOfPostingId: String(original._id),
        reversalReason: 'Posted against the wrong company',
      }),
      TENANT,
      'u2'
    );

    const rows = await repo.getNetTotalsByCompanyAcrossVehicles(
      'third-party-transport',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, null)
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].netReportingAmount).toBe(0);
    expect(rows[0].postingCount).toBe(2);
  });

  it('excludes another tenant\'s postings from the company breakdown', async () => {
    await repo.append(makePosting({ costFacingCompany: 'olivine', reportingAmount: 1000, amount: 1000 }), TENANT, 'u1');
    await repo.append(
      makePosting({ costFacingCompany: 'olivine', reportingAmount: 99999, amount: 99999 }),
      OTHER_TENANT,
      'ux'
    );

    const rows = await repo.getNetTotalsByCompanyAcrossVehicles(
      'third-party-transport',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, null)
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].netReportingAmount).toBe(1000);
  });

  it('excludes org units outside the caller\'s scope', async () => {
    await repo.append(
      makePosting({ orgUnitId: HARARE, costFacingCompany: 'olivine', reportingAmount: 1000, amount: 1000 }),
      TENANT,
      'u1'
    );
    await repo.append(
      makePosting({ orgUnitId: BULAWAYO, costFacingCompany: 'olivine', reportingAmount: 700, amount: 700 }),
      TENANT,
      'u2'
    );

    const harareOnly = await repo.getNetTotalsByCompanyAcrossVehicles(
      'third-party-transport',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, [HARARE])
    );
    expect(harareOnly[0].netReportingAmount).toBe(1000);

    const both = await repo.getNetTotalsByCompanyAcrossVehicles(
      'third-party-transport',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, [HARARE, BULAWAYO])
    );
    expect(both[0].netReportingAmount).toBe(1700);
  });

  it('excludes a posting outside the fully-contained period window', async () => {
    await repo.append(
      makePosting({
        costFacingCompany: 'olivine',
        reportingAmount: 1000,
        amount: 1000,
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-08-31T23:59:59.000Z'),
      }),
      TENANT,
      'u1'
    );

    const rows = await repo.getNetTotalsByCompanyAcrossVehicles(
      'third-party-transport',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, null)
    );

    expect(rows).toEqual([]);
  });

  it('fails closed: an empty accessible-unit set totals nothing', async () => {
    await repo.append(makePosting({ costFacingCompany: 'olivine' }), TENANT, 'u1');

    const rows = await repo.getNetTotalsByCompanyAcrossVehicles(
      'third-party-transport',
      PERIOD_START,
      PERIOD_END,
      contextFor(TENANT, [])
    );

    expect(rows).toEqual([]);
  });
});
