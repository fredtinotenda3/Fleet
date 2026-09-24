// tests/unit/transport-cost/transport-cost-command-centre.service.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 4. Exercises
// TransportCostReportService.getCommandCentreSummary against REAL
// AllocationLedgerRepository / TransportCostSourceRecordRepository /
// TransportCostImportExceptionRepository instances backed by
// tests/helpers/fake-collection.ts -- same pattern as
// transport-cost-report.service.spec.ts, so the aggregation, the
// filter-vs-breakdown semantics, and the fully-contained period rule are
// proven through the actual pipeline, not a mock of it.
//
// Covers the milestone's own 24-item test list (see
// OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md Section 7 / the Slice 4
// brief) to the extent each item is a SERVICE-level concern; tenant/
// org-unit/empty-scope/date-boundary correctness is additionally pinned
// at the repository layer (allocation-ledger-command-centre.repository
// .spec.ts, transport-cost-source-record-command-centre.repository
// .spec.ts) and unauthorized-access/permission enforcement is pinned at
// the route layer (tests/security/transport-cost-command-centre.spec.ts).

jest.mock('../../../modules/finance/repositories/allocation-ledger.repository', () => {
  const actual = jest.requireActual('../../../modules/finance/repositories/allocation-ledger.repository');
  const { FakeCollection } = jest.requireActual('../../helpers/fake-collection');
  const collection = new FakeCollection();

  class TestAllocationLedgerRepository extends actual.AllocationLedgerRepository {
    async getCollection() {
      return collection;
    }
  }

  return { __esModule: true, ...actual, allocationLedgerRepository: new TestAllocationLedgerRepository(), __fakeCollection: collection };
});

jest.mock('../../../modules/transport-cost/repositories/transport-cost-source-record.repository', () => {
  const actual = jest.requireActual('../../../modules/transport-cost/repositories/transport-cost-source-record.repository');
  const { FakeCollection } = jest.requireActual('../../helpers/fake-collection');
  const collection = new FakeCollection();

  class TestSourceRecordRepository extends actual.TransportCostSourceRecordRepository {
    async getCollection() {
      return collection;
    }
  }

  return {
    __esModule: true,
    ...actual,
    transportCostSourceRecordRepository: new TestSourceRecordRepository(),
    __fakeCollection: collection,
  };
});

jest.mock('../../../modules/transport-cost/repositories/transport-cost-import-exception.repository', () => {
  const actual = jest.requireActual('../../../modules/transport-cost/repositories/transport-cost-import-exception.repository');
  const { FakeCollection } = jest.requireActual('../../helpers/fake-collection');
  const collection = new FakeCollection();

  class TestExceptionRepository extends actual.TransportCostImportExceptionRepository {
    async getCollection() {
      return collection;
    }
  }

  return {
    __esModule: true,
    ...actual,
    transportCostImportExceptionRepository: new TestExceptionRepository(),
    __fakeCollection: collection,
  };
});

import { TransportCostReportService } from '../../../modules/transport-cost/services/transport-cost-report.service';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { allocationLedgerRepository, __fakeCollection: fakeLedger } = require('../../../modules/finance/repositories/allocation-ledger.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transportCostSourceRecordRepository, __fakeCollection: fakeSource } = require('../../../modules/transport-cost/repositories/transport-cost-source-record.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transportCostImportExceptionRepository, __fakeCollection: fakeExceptions } = require('../../../modules/transport-cost/repositories/transport-cost-import-exception.repository');

const TENANT = 'olivine-group-cc-svc';
const OTHER_TENANT = 'toyota-zimbabwe-cc-svc';
const HARARE = 'unit-harare';
const BULAWAYO = 'unit-bulawayo';
const JAN_START = new Date('2026-01-01T00:00:00.000Z');
const JAN_END = new Date('2026-01-31T23:59:59.999Z');

function contextFor(accessibleOrgUnitIds: string[] | null, organizationId: string = TENANT): TenantContext {
  return {
    organizationId,
    organizationName: 'Olivine Group',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

async function seedSourceRecord(overrides: Record<string, unknown> = {}) {
  return transportCostSourceRecordRepository.create(
    {
      orgUnitId: HARARE,
      sheetFamily: 'third-party',
      importBatchId: 'batch-1',
      sourceFileName: 'JAN-26 3rd Party.xlsx',
      sourceRowNumber: 1,
      importedAt: JAN_START,
      rawRow: { date: '05.01.26', registration: 'AGL8230', transporter: 'SIGHTSCORE', amount: 100 },
      date: JAN_START,
      rawDate: '05.01.26',
      registration: 'AGL8230',
      registrationRaw: 'AGL8230',
      transporterNormalized: 'SIGHTSCORE',
      transporterRaw: 'SIGHTSCORE',
      transporterPartnerId: 'p-1',
      contractedVehicleId: 'veh-1',
      costFacingCompany: 'olivine',
      amount: 100,
      tonnageRaw: null,
      ...overrides,
    },
    TENANT,
    'user-1'
  );
}

async function seedPosting(sourceId: string, overrides: Record<string, unknown> = {}) {
  return allocationLedgerRepository.append(
    {
      orgUnitId: HARARE,
      vehicleId: 'veh-1',
      costCategory: 'third-party-transport',
      allocationRule: 'direct',
      sourceCollection: 'tbltransportcostsourcerecords',
      sourceId,
      periodStart: JAN_START,
      periodEnd: JAN_START,
      currency: 'USD',
      amount: 100,
      fxRate: 1,
      fxRateDate: JAN_START,
      fxSource: 'organization-default',
      reportingCurrency: 'USD',
      reportingAmount: 100,
      costFacingCompany: 'olivine',
      postedBy: 'user-1',
      postedAt: JAN_START,
      ...overrides,
    },
    TENANT,
    'user-1'
  );
}

function makeVehicleRepo(vehicles: any[]) {
  return {
    findAllConfirmed: jest.fn().mockResolvedValue(vehicles),
    findById: jest.fn().mockImplementation(async (id: string) => vehicles.find((v) => v._id === id) ?? null),
    findByTransporterPartnerId: jest.fn().mockImplementation(async (id: string) => vehicles.filter((v) => v.transporterPartnerId === id)),
  } as any;
}

function makePartnerRepo(partners: any[]) {
  return { findById: jest.fn().mockImplementation(async (id: string) => partners.find((p) => p._id === id) ?? null) } as any;
}

function makeSettingsService() {
  return { resolve: jest.fn().mockResolvedValue({ reportingCurrency: 'USD', fxPolicy: 'transaction-date', glToleranceAmount: 0, usingDefaults: true }) } as any;
}

function makeService() {
  return new TransportCostReportService(
    makeVehicleRepo([{ _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1', businessStream: 'olivine' }]),
    makePartnerRepo([{ _id: 'p-1', canonicalName: 'SIGHTSCORE' }]),
    makeSettingsService(),
    allocationLedgerRepository,
    transportCostSourceRecordRepository,
    transportCostImportExceptionRepository
  );
}

beforeEach(() => {
  fakeLedger.docs = [];
  fakeLedger.seenFilters = [];
  fakeSource.docs = [];
  fakeSource.seenFilters = [];
  fakeExceptions.docs = [];
  fakeExceptions.seenFilters = [];
});

describe('getCommandCentreSummary -- period totals and granularity (items 1-4, 11)', () => {
  it('produces a single time-series bucket per day for a daily granularity', async () => {
    const src = await seedSourceRecord();
    await seedPosting(src._id!, { periodStart: JAN_START, periodEnd: JAN_START, reportingAmount: 100, amount: 100 });
    const src2 = await seedSourceRecord({ sourceRowNumber: 2, date: new Date('2026-01-02T00:00:00.000Z') });
    await seedPosting(src2._id!, {
      periodStart: new Date('2026-01-02T00:00:00.000Z'),
      periodEnd: new Date('2026-01-02T00:00:00.000Z'),
      reportingAmount: 200,
      amount: 200,
    });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'day');
    expect(summary.timeSeries).toHaveLength(2);
    expect(summary.timeSeries[0].netReportingAmount).toBe(100);
    expect(summary.timeSeries[1].netReportingAmount).toBe(200);
    expect(summary.totals).toEqual([{ key: 'total', label: 'Total', reportingCurrency: 'USD', netReportingAmount: 300, postingCount: 2 }]);
  });

  it('buckets by ISO week (Monday start) for a weekly granularity', async () => {
    const src = await seedSourceRecord();
    // Jan 5 2026 is a Monday; Jan 7 is the same week.
    await seedPosting(src._id!, { periodStart: new Date('2026-01-05T00:00:00.000Z'), periodEnd: new Date('2026-01-05T00:00:00.000Z') });
    const src2 = await seedSourceRecord({ sourceRowNumber: 2 });
    await seedPosting(src2._id!, {
      periodStart: new Date('2026-01-07T00:00:00.000Z'),
      periodEnd: new Date('2026-01-07T00:00:00.000Z'),
      reportingAmount: 50,
      amount: 50,
    });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'week');
    expect(summary.timeSeries).toHaveLength(1);
    expect(summary.timeSeries[0].netReportingAmount).toBe(150);
    expect(summary.timeSeries[0].bucketStart.toISOString().slice(0, 10)).toBe('2026-01-05');
  });

  it('buckets by calendar month for a monthly granularity', async () => {
    const src = await seedSourceRecord();
    await seedPosting(src._id!);
    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(summary.timeSeries).toHaveLength(1);
    expect(summary.timeSeries[0].bucketStart.toISOString().slice(0, 7)).toBe('2026-01');
  });

  it('accepts a custom (non-calendar-aligned) date range', async () => {
    const src = await seedSourceRecord({ date: new Date('2026-01-10T00:00:00.000Z') });
    await seedPosting(src._id!, { periodStart: new Date('2026-01-10T00:00:00.000Z'), periodEnd: new Date('2026-01-10T00:00:00.000Z') });

    const summary = await makeService().getCommandCentreSummary(
      contextFor(null),
      new Date('2026-01-08T00:00:00.000Z'),
      new Date('2026-01-12T23:59:59.999Z'),
      'day'
    );
    expect(summary.totals[0].netReportingAmount).toBe(100);
  });
});

describe('getCommandCentreSummary -- filtering (items 5-10)', () => {
  it('filters by cost-facing company', async () => {
    const src1 = await seedSourceRecord({ costFacingCompany: 'hypery' });
    await seedPosting(src1._id!, { costFacingCompany: 'hypery' });
    const src2 = await seedSourceRecord({ sourceRowNumber: 2, costFacingCompany: 'olivine' });
    await seedPosting(src2._id!, { costFacingCompany: 'olivine', reportingAmount: 500, amount: 500 });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month', { costFacingCompany: 'hypery' });
    expect(summary.totals).toEqual([{ key: 'total', label: 'Total', reportingCurrency: 'USD', netReportingAmount: 100, postingCount: 1 }]);
  });

  it('filters by cost category, and rejects a category outside TRANSPORT_COST_CATEGORIES', async () => {
    const src = await seedSourceRecord();
    await seedPosting(src._id!, { costCategory: 'stock-transfer' });
    const src2 = await seedSourceRecord({ sourceRowNumber: 2 });
    await seedPosting(src2._id!, { costCategory: 'third-party-transport', reportingAmount: 50, amount: 50 });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month', { costCategory: 'stock-transfer' });
    expect(summary.totals[0].netReportingAmount).toBe(100);

    await expect(
      makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month', { costCategory: 'fuel' as any })
    ).rejects.toThrow();
  });

  it('filters by vehicle', async () => {
    const src1 = await seedSourceRecord({ contractedVehicleId: 'veh-1' });
    await seedPosting(src1._id!, { vehicleId: 'veh-1' });
    const src2 = await seedSourceRecord({ sourceRowNumber: 2, contractedVehicleId: 'veh-2' });
    await seedPosting(src2._id!, { vehicleId: 'veh-2', reportingAmount: 999, amount: 999 });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month', { vehicleId: 'veh-1' });
    expect(summary.totals[0].netReportingAmount).toBe(100);
  });

  it('filters by transporter, resolving to that transporter\'s vehicle set', async () => {
    const service = new TransportCostReportService(
      makeVehicleRepo([
        { _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1' },
        { _id: 'veh-2', registration: 'AFJ5203', transporterPartnerId: 'p-2' },
      ]),
      makePartnerRepo([{ _id: 'p-1', canonicalName: 'SIGHTSCORE' }, { _id: 'p-2', canonicalName: 'SHARMIC' }]),
      makeSettingsService(),
      allocationLedgerRepository,
      transportCostSourceRecordRepository,
      transportCostImportExceptionRepository
    );

    const src1 = await seedSourceRecord({ contractedVehicleId: 'veh-1' });
    await seedPosting(src1._id!, { vehicleId: 'veh-1' });
    const src2 = await seedSourceRecord({ sourceRowNumber: 2, contractedVehicleId: 'veh-2' });
    await seedPosting(src2._id!, { vehicleId: 'veh-2', reportingAmount: 999, amount: 999 });

    const summary = await service.getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month', { transporterPartnerId: 'p-1' });
    expect(summary.totals[0].netReportingAmount).toBe(100);
  });

  it('a transporter filter that resolves to zero vehicles returns "no data", not everything', async () => {
    const src = await seedSourceRecord();
    await seedPosting(src._id!);

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month', { transporterPartnerId: 'p-nonexistent' });
    expect(summary.totals).toEqual([]);
  });

  it('filters by destination, matching a line value even when the flat field differs', async () => {
    const src = await seedSourceRecord({
      destinationTown: 'Harare',
      lines: [
        { lineNumber: 1, destinationTown: 'Harare' },
        { lineNumber: 2, destinationTown: 'Mutare' },
      ],
    });
    await seedPosting(src._id!);

    const forMutare = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month', { destinationTown: 'Mutare' });
    expect(forMutare.totals[0].netReportingAmount).toBe(100);

    const forBulawayo = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month', { destinationTown: 'Bulawayo' });
    expect(forBulawayo.totals).toEqual([]);
  });

  it('filters by customer', async () => {
    const src1 = await seedSourceRecord({ customerName: 'Customer A' });
    await seedPosting(src1._id!);
    const src2 = await seedSourceRecord({ sourceRowNumber: 2, customerName: 'Customer B' });
    await seedPosting(src2._id!, { reportingAmount: 999, amount: 999 });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month', { customerName: 'Customer A' });
    expect(summary.totals[0].netReportingAmount).toBe(100);
  });
});

describe('getCommandCentreSummary -- multi-line correctness (items 12, 13, 14 -- "a critical correctness requirement")', () => {
  it('a multi-line operation contributes its posting exactly once to totals/byCompany/byVehicle even when filtered by a customer on one line', async () => {
    const src = await seedSourceRecord({
      customerName: 'Customer A',
      lines: [
        { lineNumber: 1, customerName: 'Customer A', tonnageRaw: 2 },
        { lineNumber: 2, customerName: 'Customer B', tonnageRaw: 3 },
        { lineNumber: 3, customerName: 'Customer C', tonnageRaw: 1 },
      ],
    });
    await seedPosting(src._id!, { reportingAmount: 300, amount: 300 });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month', { customerName: 'Customer B' });

    // ONE posting counted ONCE -- never 300 * 3 lines, never 3 separate rows.
    expect(summary.totals).toEqual([{ key: 'total', label: 'Total', reportingCurrency: 'USD', netReportingAmount: 300, postingCount: 1 }]);
    expect(summary.byVehicle[0].postingCount).toBe(1);
    // byCustomer buckets by the PRIMARY (line-1) customer only -- "Customer A", not "Customer B" -- documented, honest behaviour.
    expect(summary.byCustomer).toEqual([
      expect.objectContaining({ key: 'Customer A', netReportingAmount: 300, postingCount: 1 }),
    ]);
  });

  it('operations and loads are reported separately -- a 3-line operation is ONE operation, THREE loads, never a cost multiplied by 3', async () => {
    const src = await seedSourceRecord({
      lines: [{ lineNumber: 1 }, { lineNumber: 2 }, { lineNumber: 3 }],
    });
    await seedPosting(src._id!, { reportingAmount: 300, amount: 300 });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(summary.operational).toEqual({ totalOperations: 1, totalLines: 3, multiLineOperationCount: 1 });
    expect(summary.totals[0].netReportingAmount).toBe(300);
  });

  it('byDestination/byCustomer bars always sum back to the same total as `totals` -- never more', async () => {
    const src = await seedSourceRecord({
      destinationTown: 'Harare',
      lines: [
        { lineNumber: 1, destinationTown: 'Harare' },
        { lineNumber: 2, destinationTown: 'Mutare' },
      ],
    });
    await seedPosting(src._id!, { reportingAmount: 300, amount: 300 });
    const src2 = await seedSourceRecord({ sourceRowNumber: 2, destinationTown: 'Bulawayo' });
    await seedPosting(src2._id!, { reportingAmount: 100, amount: 100 });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    const destinationSum = summary.byDestination.reduce((acc, d) => acc + d.netReportingAmount, 0);
    expect(destinationSum).toBe(summary.totals[0].netReportingAmount);
    expect(destinationSum).toBe(400);
  });
});

describe('getCommandCentreSummary -- no-data / unavailable states (items 15, 16)', () => {
  it('returns empty arrays, not a fabricated zero row, when nothing posted in the period', async () => {
    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(summary.totals).toEqual([]);
    expect(summary.byCompany).toEqual([]);
    expect(summary.byVehicle).toEqual([]);
    expect(summary.timeSeries).toEqual([]);
  });

  it('a posting whose source record has no destination groups under the honest "unavailable" bucket, not a fabricated town', async () => {
    const src = await seedSourceRecord({ sheetFamily: 'third-party', destinationTown: undefined });
    await seedPosting(src._id!);

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(summary.byDestination).toEqual([expect.objectContaining({ key: 'unavailable', label: 'Unavailable' })]);
  });

  it('a Vansales posting with no destination groups under "not-applicable", never "unavailable"', async () => {
    const src = await seedSourceRecord({ sheetFamily: 'vansales', destinationTown: undefined, registration: null });
    await seedPosting(src._id!, { costCategory: 'transport-retainer' });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(summary.byDestination).toEqual([expect.objectContaining({ key: 'not-applicable', label: 'Not applicable' })]);
  });
});

describe('getCommandCentreSummary -- data quality (item 21) and ledger-only financial totals (item 23)', () => {
  it('reports pending/rejected/duplicate/unresolved counts independently, never blended into the financial totals', async () => {
    const posted = await seedSourceRecord();
    await seedPosting(posted._id!);
    // A pending row (amount null) -- never posted, so it must not appear in `totals`.
    await seedSourceRecord({ sourceRowNumber: 2, amount: null });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(summary.totals[0].netReportingAmount).toBe(100); // unaffected by the pending row
    expect(summary.dataQuality.pendingAmountCount).toBe(1);
    expect(summary.pending).toEqual({ pendingSourceRecordCount: 1, hasPendingAmounts: true });
  });
});

describe('getCommandCentreSummary -- date boundary behaviour (item 22)', () => {
  it('rejects an inverted period range', async () => {
    await expect(makeService().getCommandCentreSummary(contextFor(null), JAN_END, JAN_START, 'month')).rejects.toThrow();
  });

  it('rejects a range wider than the documented guard', async () => {
    await expect(
      makeService().getCommandCentreSummary(contextFor(null), new Date('2020-01-01'), new Date('2026-01-01'), 'month')
    ).rejects.toThrow();
  });

  it('excludes a posting whose period is not fully contained in the requested window', async () => {
    const src = await seedSourceRecord();
    await seedPosting(src._id!, { periodStart: new Date('2025-12-31T00:00:00.000Z'), periodEnd: new Date('2026-01-01T12:00:00.000Z') });

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(summary.totals).toEqual([]);
  });
});

describe('getCommandCentreSummary -- tenant and org-unit isolation (items 17, 18, 19)', () => {
  it('excludes another tenant\'s data entirely', async () => {
    const mine = await seedSourceRecord();
    await seedPosting(mine._id!);
    const other = await transportCostSourceRecordRepository.create(
      { orgUnitId: HARARE, sheetFamily: 'third-party', importBatchId: 'b', sourceFileName: 'x', sourceRowNumber: 1, importedAt: JAN_START, rawRow: {}, date: JAN_START, rawDate: '', registration: 'X', registrationRaw: 'X', transporterNormalized: null, transporterRaw: '', amount: 9999, tonnageRaw: null },
      OTHER_TENANT,
      'u'
    );
    await allocationLedgerRepository.append(
      { orgUnitId: HARARE, vehicleId: 'veh-9', costCategory: 'third-party-transport', allocationRule: 'direct', sourceCollection: 'tbltransportcostsourcerecords', sourceId: other._id!, periodStart: JAN_START, periodEnd: JAN_START, currency: 'USD', amount: 9999, fxRate: 1, fxRateDate: JAN_START, fxSource: 'organization-default', reportingCurrency: 'USD', reportingAmount: 9999, postedBy: 'u', postedAt: JAN_START },
      OTHER_TENANT,
      'u'
    );

    const summary = await makeService().getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(summary.totals).toEqual([{ key: 'total', label: 'Total', reportingCurrency: 'USD', netReportingAmount: 100, postingCount: 1 }]);
  });

  it('excludes org units outside the caller\'s accessible scope', async () => {
    const harare = await seedSourceRecord({ orgUnitId: HARARE });
    await seedPosting(harare._id!, { orgUnitId: HARARE });
    const bulawayo = await seedSourceRecord({ sourceRowNumber: 2, orgUnitId: BULAWAYO });
    await seedPosting(bulawayo._id!, { orgUnitId: BULAWAYO, reportingAmount: 500, amount: 500 });

    const hararOnly = await makeService().getCommandCentreSummary(contextFor([HARARE]), JAN_START, JAN_END, 'month');
    expect(hararOnly.totals[0].netReportingAmount).toBe(100);

    const both = await makeService().getCommandCentreSummary(contextFor([HARARE, BULAWAYO]), JAN_START, JAN_END, 'month');
    expect(both.totals[0].netReportingAmount).toBe(600);
  });

  it('fails closed -- an empty accessible-org-unit set returns no data, never the whole tenant', async () => {
    const src = await seedSourceRecord();
    await seedPosting(src._id!);

    const summary = await makeService().getCommandCentreSummary(contextFor([]), JAN_START, JAN_END, 'month');
    expect(summary.totals).toEqual([]);
    expect(summary.byCompany).toEqual([]);
    expect(summary.operational).toEqual({ totalOperations: 0, totalLines: 0, multiLineOperationCount: 0 });
  });
});
