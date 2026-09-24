// tests/unit/transport-cost/allocation-ledger-command-centre.repository.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 4 (Command Centre). Pins
// AllocationLedgerRepository.getNetTotalsGrouped -- the one flexible
// aggregation the Command Centre summary builds every ledger-sourced KPI
// card and chart from (see that method's own header comment) -- and the
// widened findRawByCategoryInScope's extra company/vehicle match. Same
// FakeCollection-backed, real-repository pattern as
// allocation-ledger-company-totals.repository.spec.ts: netting/grouping
// behaviour lives in the pipeline, so mocking the repository would test
// the mock instead.

import { AllocationLedgerRepository } from '../../../modules/finance/repositories/allocation-ledger.repository';
import { FakeCollection } from '../../helpers/fake-collection';
import type { AllocationPosting } from '../../../modules/finance/types/allocation.types';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

const TENANT = 'olivine-group-cc1';
const OTHER_TENANT = 'toyota-zimbabwe-cc1';
const HARARE = 'unit-harare';
const BULAWAYO = 'unit-bulawayo';

const collection = new FakeCollection();

class TestAllocationLedgerRepository extends AllocationLedgerRepository {
  protected async getCollection(): Promise<any> {
    return collection as unknown as any;
  }
}

const repo = new TestAllocationLedgerRepository();

function contextFor(organizationId: string, accessibleOrgUnitIds: string[] | null): TenantContext {
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
const SCOPE: AllocationPosting['costCategory'][] = ['third-party-transport', 'transport-retainer', 'stock-transfer'];

function makePosting(overrides: Partial<AppendInput> = {}): AppendInput {
  return {
    orgUnitId: HARARE,
    vehicleId: 'veh-1',
    costCategory: 'third-party-transport',
    allocationRule: 'direct',
    sourceCollection: 'tbltransportcostsourcerecords',
    sourceId: 'source-1',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    currency: 'USD',
    amount: 100,
    fxRate: 1,
    fxRateDate: PERIOD_START,
    fxSource: 'organization-default',
    reportingCurrency: 'USD',
    reportingAmount: 100,
    postedBy: 'user-1',
    postedAt: new Date('2026-07-15T10:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  collection.docs = [];
  collection.seenFilters = [];
});

describe('AllocationLedgerRepository.getNetTotalsGrouped', () => {
  it("dimension 'none' returns the period total, split by currency only", async () => {
    await repo.append(makePosting({ costFacingCompany: 'hypery', reportingAmount: 100, amount: 100 }), TENANT, 'u1');
    await repo.append(makePosting({ costFacingCompany: 'olivine', reportingAmount: 200, amount: 200 }), TENANT, 'u1');

    const rows = await repo.getNetTotalsGrouped('none', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null));
    expect(rows).toEqual([{ key: null, reportingCurrency: 'USD', netReportingAmount: 300, postingCount: 2 }]);
  });

  it("dimension 'costCategory' groups across TRANSPORT_COST_CATEGORIES", async () => {
    await repo.append(makePosting({ costCategory: 'third-party-transport', reportingAmount: 100, amount: 100 }), TENANT, 'u1');
    await repo.append(makePosting({ costCategory: 'transport-retainer', reportingAmount: 50, amount: 50 }), TENANT, 'u1');
    await repo.append(makePosting({ costCategory: 'stock-transfer', reportingAmount: 25, amount: 25 }), TENANT, 'u1');
    // Out of scope entirely -- must never appear.
    await repo.append(makePosting({ costCategory: 'fuel', reportingAmount: 9999, amount: 9999 }), TENANT, 'u1');

    const rows = await repo.getNetTotalsGrouped('costCategory', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null));
    const byCategory = Object.fromEntries(rows.map((r) => [r.key, r.netReportingAmount]));
    expect(byCategory).toEqual({ 'third-party-transport': 100, 'transport-retainer': 50, 'stock-transfer': 25 });
  });

  it('narrows to one category when filters.costCategory is given', async () => {
    await repo.append(makePosting({ costCategory: 'third-party-transport', reportingAmount: 100, amount: 100 }), TENANT, 'u1');
    await repo.append(makePosting({ costCategory: 'transport-retainer', reportingAmount: 50, amount: 50 }), TENANT, 'u1');

    const rows = await repo.getNetTotalsGrouped('none', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null), {
      costCategory: 'transport-retainer',
    });
    expect(rows).toEqual([{ key: null, reportingCurrency: 'USD', netReportingAmount: 50, postingCount: 1 }]);
  });

  it('combines a vehicleId filter and a vehicleIds set as an INTERSECTION, not last-write-wins', async () => {
    await repo.append(makePosting({ vehicleId: 'veh-1', reportingAmount: 100, amount: 100 }), TENANT, 'u1');
    await repo.append(makePosting({ vehicleId: 'veh-2', reportingAmount: 200, amount: 200 }), TENANT, 'u1');

    // veh-1 IS a member of the transporter's vehicle set -> matches.
    const matching = await repo.getNetTotalsGrouped('none', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null), {
      vehicleId: 'veh-1',
      vehicleIds: ['veh-1', 'veh-9'],
    });
    expect(matching).toEqual([{ key: null, reportingCurrency: 'USD', netReportingAmount: 100, postingCount: 1 }]);

    // veh-2 is NOT a member of the given vehicle set -> the two filters
    // contradict each other and the correct result is "nothing", never
    // silently picking one filter over the other.
    const contradicting = await repo.getNetTotalsGrouped('none', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null), {
      vehicleId: 'veh-2',
      vehicleIds: ['veh-1'],
    });
    expect(contradicting).toEqual([]);
  });

  it('an empty vehicleIds set (a transporter filter that resolved to zero vehicles) returns no data, not everything', async () => {
    await repo.append(makePosting({ vehicleId: 'veh-1', reportingAmount: 100, amount: 100 }), TENANT, 'u1');

    const rows = await repo.getNetTotalsGrouped('none', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null), {
      vehicleIds: [],
    });
    expect(rows).toEqual([]);
  });

  it("excludes another tenant's postings", async () => {
    await repo.append(makePosting({ reportingAmount: 100, amount: 100 }), TENANT, 'u1');
    await repo.append(makePosting({ reportingAmount: 99999, amount: 99999 }), OTHER_TENANT, 'ux');

    const rows = await repo.getNetTotalsGrouped('none', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null));
    expect(rows).toEqual([{ key: null, reportingCurrency: 'USD', netReportingAmount: 100, postingCount: 1 }]);
  });

  it('excludes org units outside the caller\'s scope, and fails closed on an empty accessible set', async () => {
    await repo.append(makePosting({ orgUnitId: HARARE, reportingAmount: 100, amount: 100 }), TENANT, 'u1');
    await repo.append(makePosting({ orgUnitId: BULAWAYO, reportingAmount: 700, amount: 700 }), TENANT, 'u2');

    const harareOnly = await repo.getNetTotalsGrouped('none', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, [HARARE]));
    expect(harareOnly).toEqual([{ key: null, reportingCurrency: 'USD', netReportingAmount: 100, postingCount: 1 }]);

    const emptyScope = await repo.getNetTotalsGrouped('none', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, []));
    expect(emptyScope).toEqual([]);
  });

  it('excludes a posting outside the fully-contained period window (date boundary)', async () => {
    await repo.append(
      makePosting({
        reportingAmount: 1000,
        amount: 1000,
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-08-31T23:59:59.000Z'),
      }),
      TENANT,
      'u1'
    );

    const rows = await repo.getNetTotalsGrouped('none', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null));
    expect(rows).toEqual([]);
  });

  it('a reversal nets a dimension total to zero while postingCount still reflects both rows', async () => {
    const original = await repo.append(makePosting({ costFacingCompany: 'olivine', reportingAmount: 500, amount: 500 }), TENANT, 'u1');
    await repo.append(
      makePosting({
        costFacingCompany: 'olivine',
        reportingAmount: -500,
        amount: -500,
        reversalOfPostingId: String(original._id),
        reversalReason: 'test',
      }),
      TENANT,
      'u2'
    );

    const rows = await repo.getNetTotalsGrouped('costFacingCompany', SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null));
    expect(rows).toEqual([{ key: 'olivine', reportingCurrency: 'USD', netReportingAmount: 0, postingCount: 2 }]);
  });
});

describe('AllocationLedgerRepository.findRawByCategoryInScope (widened extraMatch)', () => {
  it('narrows by costFacingCompany and vehicleId when given, alongside the existing period/category scope', async () => {
    await repo.append(makePosting({ costFacingCompany: 'hypery', vehicleId: 'veh-1', sourceId: 's1' }), TENANT, 'u1');
    await repo.append(makePosting({ costFacingCompany: 'olivine', vehicleId: 'veh-2', sourceId: 's2' }), TENANT, 'u1');

    const rows = await repo.findRawByCategoryInScope(SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null), {
      costFacingCompany: 'hypery',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceId).toBe('s1');
  });

  it('an empty vehicleIds extraMatch returns nothing rather than the whole scope', async () => {
    await repo.append(makePosting({ vehicleId: 'veh-1' }), TENANT, 'u1');
    const rows = await repo.findRawByCategoryInScope(SCOPE, PERIOD_START, PERIOD_END, contextFor(TENANT, null), {
      vehicleIds: [],
    });
    expect(rows).toEqual([]);
  });
});
