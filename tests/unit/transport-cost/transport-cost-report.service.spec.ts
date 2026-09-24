// tests/unit/transport-cost/transport-cost-report.service.spec.ts
//
// Phase O4 (minimal slice). Exercises TransportCostReportService against
// a REAL AllocationLedgerRepository backed by tests/helpers/fake-
// collection.ts, same pattern as the O3 posting-service spec: the
// currency-grouping and fully-contained-period aggregation are real, not
// mocked, so "mixed currencies are never summed" and "a spanning/out-of-
// window posting is excluded" are proven through the actual pipeline.
//
// Covers:
//  - Stream -> Vehicle totals, sourced ONLY from postings (never raw
//    source records)
//  - a vehicle with no businessStream groups under 'unattributed'
//    (today's honest state of the real January 2026 data)
//  - mixed reporting currencies are reported separately, never summed
//  - the pending-Amount banner flag reflects real pending source rows,
//    and is independent of (never blended into) the posted total
//  - drill-down to individual postings for one vehicle

jest.mock('../../../modules/finance/repositories/allocation-ledger.repository', () => {
  const actual = jest.requireActual('../../../modules/finance/repositories/allocation-ledger.repository');
  const { FakeCollection } = jest.requireActual('../../helpers/fake-collection');
  const collection = new FakeCollection();

  class TestAllocationLedgerRepository extends actual.AllocationLedgerRepository {
    async getCollection() {
      return collection;
    }
  }

  return {
    __esModule: true,
    ...actual,
    allocationLedgerRepository: new TestAllocationLedgerRepository(),
    __fakeCollection: collection,
  };
});

// ADDED, item 6: getDataQualityExceptions reads real source-record and
// exception repositories (never mocks-of-mocks for these two -- the
// batch-membership join between tbltransportcostsourcerecords and
// tbltransportcostimportexceptions is exactly the logic under test),
// same FakeCollection-backed pattern as the ledger mock above.
jest.mock('../../../modules/transport-cost/repositories/transport-cost-source-record.repository', () => {
  const actual = jest.requireActual('../../../modules/transport-cost/repositories/transport-cost-source-record.repository');
  const { FakeCollection } = jest.requireActual('../../helpers/fake-collection');
  const collection = new FakeCollection();

  class TestTransportCostSourceRecordRepository extends actual.TransportCostSourceRecordRepository {
    async getCollection() {
      return collection;
    }
  }

  return {
    __esModule: true,
    ...actual,
    transportCostSourceRecordRepository: new TestTransportCostSourceRecordRepository(),
    __fakeCollection: collection,
  };
});

jest.mock('../../../modules/transport-cost/repositories/transport-cost-import-exception.repository', () => {
  const actual = jest.requireActual('../../../modules/transport-cost/repositories/transport-cost-import-exception.repository');
  const { FakeCollection } = jest.requireActual('../../helpers/fake-collection');
  const collection = new FakeCollection();

  class TestTransportCostImportExceptionRepository extends actual.TransportCostImportExceptionRepository {
    async getCollection() {
      return collection;
    }
  }

  return {
    __esModule: true,
    ...actual,
    transportCostImportExceptionRepository: new TestTransportCostImportExceptionRepository(),
    __fakeCollection: collection,
  };
});

import { TransportCostReportService } from '../../../modules/transport-cost/services/transport-cost-report.service';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { allocationLedgerRepository, __fakeCollection: fakeCollection } = require('../../../modules/finance/repositories/allocation-ledger.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transportCostSourceRecordRepository, __fakeCollection: fakeSourceRecordCollection } = require('../../../modules/transport-cost/repositories/transport-cost-source-record.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transportCostImportExceptionRepository, __fakeCollection: fakeExceptionCollection } = require('../../../modules/transport-cost/repositories/transport-cost-import-exception.repository');

const TENANT = 'olivine-group-o4';
const JAN_START = new Date('2026-01-01T00:00:00.000Z');
const JAN_END = new Date('2026-01-31T23:59:59.999Z');

function contextFor(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Olivine Group',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

async function seedPosting(overrides: Record<string, unknown> = {}) {
  return allocationLedgerRepository.append(
    {
      orgUnitId: 'unit-harare',
      vehicleId: 'veh-1',
      costCategory: 'third-party-transport',
      allocationRule: 'direct',
      sourceCollection: 'tbltransportcostsourcerecords',
      sourceId: 'src-1',
      periodStart: JAN_START,
      periodEnd: JAN_START,
      currency: 'USD',
      amount: 100,
      fxRate: 1,
      fxRateDate: JAN_START,
      fxSource: 'organization-default',
      reportingCurrency: 'USD',
      reportingAmount: 100,
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
  } as any;
}

function makePartnerRepo(partners: any[]) {
  return {
    findById: jest.fn().mockImplementation(async (id: string) => partners.find((p) => p._id === id) ?? null),
  } as any;
}

function makeSettingsService() {
  return {
    resolve: jest.fn().mockResolvedValue({
      reportingCurrency: 'USD',
      fxPolicy: 'transaction-date',
      glToleranceAmount: 0,
      usingDefaults: true,
    }),
  } as any;
}

function makeSourceRepo(
  pendingCount = 0,
  loadSummary: { totalOperations: number; totalLines: number; multiLineOperationCount: number } = {
    totalOperations: 0,
    totalLines: 0,
    multiLineOperationCount: 0,
  }
) {
  return {
    countPendingAmount: jest.fn().mockResolvedValue(pendingCount),
    // OLIVINE LIVE OPERATING MODEL, SLICE 2: getAllocationReport now
    // also calls getLoadSummaryInScope -- stubbed here so every
    // pre-existing test constructing a report service with
    // makeSourceRepo() keeps working unchanged.
    getLoadSummaryInScope: jest.fn().mockResolvedValue(loadSummary),
  } as any;
}

beforeEach(() => {
  fakeCollection.docs = [];
  fakeCollection.seenFilters = [];
  fakeSourceRecordCollection.docs = [];
  fakeSourceRecordCollection.seenFilters = [];
  fakeExceptionCollection.docs = [];
  fakeExceptionCollection.seenFilters = [];
});

async function seedSourceRecord(overrides: Record<string, unknown> = {}) {
  return transportCostSourceRecordRepository.create(
    {
      orgUnitId: 'unit-harare',
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
      amount: 100,
      tonnageRaw: null,
      ...overrides,
    },
    TENANT,
    'user-1'
  );
}

async function seedException(overrides: Record<string, unknown> = {}) {
  return transportCostImportExceptionRepository.log(
    {
      orgUnitId: 'unit-harare',
      importBatchId: 'batch-1',
      sheetFamily: 'third-party',
      sourceFileName: 'JAN-26 3rd Party.xlsx',
      sourceRowNumber: 2,
      kind: 'rejected',
      column: 'registration',
      reason: 'Truck registration number is required',
      invalidValue: '',
      rawRow: { date: '06.01.26', registration: '', transporter: 'PRINORTH', amount: 50 },
      importedAt: JAN_START,
      ...overrides,
    },
    TENANT,
    'user-1'
  );
}

describe('TransportCostReportService.getAllocationReport', () => {
  it('groups postings by resolved business stream and vehicle, sourced only from the ledger', async () => {
    await seedPosting({ vehicleId: 'veh-1', amount: 100, reportingAmount: 100 });
    await seedPosting({ vehicleId: 'veh-2', amount: 200, reportingAmount: 200, sourceId: 'src-2' });

    const service = new TransportCostReportService(
      makeVehicleRepo([
        { _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1', businessStream: 'olivine' },
        { _id: 'veh-2', registration: 'AFJ5203', transporterPartnerId: 'p-2' }, // no businessStream
      ]),
      makePartnerRepo([
        { _id: 'p-1', canonicalName: 'SIGHTSCORE' },
        { _id: 'p-2', canonicalName: 'SHARMIC' },
      ]),
      makeSettingsService(),
      allocationLedgerRepository,
      makeSourceRepo(0)
    );

    const report = await service.getAllocationReport(contextFor(null), JAN_START, JAN_END);

    expect(report.byVehicle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contractedVehicleId: 'veh-1', registration: 'AGL8230', businessStream: 'olivine', netReportingAmount: 100 }),
        expect.objectContaining({ contractedVehicleId: 'veh-2', registration: 'AFJ5203', businessStream: 'unattributed', netReportingAmount: 200 }),
      ])
    );

    const olivine = report.byBusinessStream.find((s) => s.businessStream === 'olivine');
    const unattributed = report.byBusinessStream.find((s) => s.businessStream === 'unattributed');
    expect(olivine?.netReportingAmount).toBe(100);
    expect(unattributed?.netReportingAmount).toBe(200);
    expect(report.mixedReportingCurrencies).toBeUndefined();
  });

  it('reports mixed reporting currencies separately -- never summed together', async () => {
    await seedPosting({ vehicleId: 'veh-1', amount: 100, reportingAmount: 100, currency: 'USD', reportingCurrency: 'USD' });
    await seedPosting({
      vehicleId: 'veh-1',
      sourceId: 'src-2',
      amount: 50,
      reportingAmount: 50,
      currency: 'ZWL',
      reportingCurrency: 'ZWL',
    });

    const service = new TransportCostReportService(
      makeVehicleRepo([{ _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1' }]),
      makePartnerRepo([{ _id: 'p-1', canonicalName: 'SIGHTSCORE' }]),
      makeSettingsService(),
      allocationLedgerRepository,
      makeSourceRepo(0)
    );

    const report = await service.getAllocationReport(contextFor(null), JAN_START, JAN_END);

    expect(report.mixedReportingCurrencies).toEqual(expect.arrayContaining(['USD', 'ZWL']));
    // Two separate rows for the same vehicle, one per currency -- not one row summing 100 + 50.
    const veh1Rows = report.byVehicle.filter((v) => v.contractedVehicleId === 'veh-1');
    expect(veh1Rows).toHaveLength(2);
    expect(veh1Rows.map((r) => r.netReportingAmount).sort((a, b) => a - b)).toEqual([50, 100]);
  });

  it('flags pending amounts without blending them into the posted total', async () => {
    await seedPosting({ vehicleId: 'veh-1', amount: 100, reportingAmount: 100 });

    const service = new TransportCostReportService(
      makeVehicleRepo([{ _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1' }]),
      makePartnerRepo([{ _id: 'p-1', canonicalName: 'SIGHTSCORE' }]),
      makeSettingsService(),
      allocationLedgerRepository,
      makeSourceRepo(27) // 27 rows in the period still have no Amount
    );

    const report = await service.getAllocationReport(contextFor(null), JAN_START, JAN_END);

    expect(report.byVehicle[0].netReportingAmount).toBe(100);
    expect(report.pending).toEqual({ pendingSourceRecordCount: 27, hasPendingAmounts: true });
  });

  it('reports no pending flag when nothing is pending', async () => {
    await seedPosting();
    const service = new TransportCostReportService(
      makeVehicleRepo([{ _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1' }]),
      makePartnerRepo([{ _id: 'p-1', canonicalName: 'SIGHTSCORE' }]),
      makeSettingsService(),
      allocationLedgerRepository,
      makeSourceRepo(0)
    );

    const report = await service.getAllocationReport(contextFor(null), JAN_START, JAN_END);
    expect(report.pending).toEqual({ pendingSourceRecordCount: 0, hasPendingAmounts: false });
  });

  it('excludes a reversed posting from the total (nets to zero, both rows still exist)', async () => {
    const original = await seedPosting({ vehicleId: 'veh-1', amount: 100, reportingAmount: 100 });
    await seedPosting({
      vehicleId: 'veh-1',
      sourceId: 'src-1',
      amount: -100,
      reportingAmount: -100,
      reversalOfPostingId: String(original._id),
      reversalReason: 'test reversal',
    });

    const service = new TransportCostReportService(
      makeVehicleRepo([{ _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1' }]),
      makePartnerRepo([{ _id: 'p-1', canonicalName: 'SIGHTSCORE' }]),
      makeSettingsService(),
      allocationLedgerRepository,
      makeSourceRepo(0)
    );

    const report = await service.getAllocationReport(contextFor(null), JAN_START, JAN_END);
    expect(report.byVehicle[0].netReportingAmount).toBe(0);
    expect(report.byVehicle[0].postingCount).toBe(2);
  });
});

describe('TransportCostReportService.getPostingsForVehicle', () => {
  it('drills down to the individual postings for one vehicle in a period', async () => {
    await seedPosting({ vehicleId: 'veh-1', amount: 100, reportingAmount: 100 });
    await seedPosting({ vehicleId: 'veh-2', amount: 200, reportingAmount: 200, sourceId: 'src-2' });

    const service = new TransportCostReportService(
      makeVehicleRepo([{ _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1', businessStream: 'olivine' }]),
      makePartnerRepo([{ _id: 'p-1', canonicalName: 'SIGHTSCORE' }]),
      makeSettingsService(),
      allocationLedgerRepository,
      makeSourceRepo(0)
    );

    const drilldown = await service.getPostingsForVehicle(contextFor(null), 'veh-1', JAN_START, JAN_END);
    expect(drilldown.registration).toBe('AGL8230');
    expect(drilldown.transporterName).toBe('SIGHTSCORE');
    expect(drilldown.businessStream).toBe('olivine');
    expect(drilldown.postings).toHaveLength(1);
    expect(drilldown.postings[0].vehicleId).toBe('veh-1');
  });
});

// ADDED, item 6: "Add a data-quality exceptions export ... so the four
// year-typo rows and the rejected rows are findable without reading the
// README."
describe('TransportCostReportService.getDataQualityExceptions', () => {
  function makeService() {
    return new TransportCostReportService(
      makeVehicleRepo([]),
      makePartnerRepo([]),
      makeSettingsService(),
      allocationLedgerRepository,
      transportCostSourceRecordRepository,
      transportCostImportExceptionRepository
    );
  }

  it('returns persisted rejected/duplicate exceptions and computed period-outlier postings for a batch that touched the period', async () => {
    // A normal, in-period row -- what makes batch-1 "touch" January 2026.
    const src1 = await seedSourceRecord({ sourceRowNumber: 1 });
    await seedPosting({
      vehicleId: 'veh-1',
      sourceId: String(src1._id),
      amount: 100,
      reportingAmount: 100,
      periodStart: JAN_START,
      periodEnd: JAN_START,
    });

    // Same batch, a year-typo row: posts correctly to Jan 2025, so it
    // never shows up in an in-period query -- exactly the January 2026
    // finding (rows 93/96/97/105, "31.01.25" on a sheet named "JAN-26").
    const src2 = await seedSourceRecord({
      sourceRowNumber: 93,
      rawDate: '30.01.25',
      registrationRaw: 'ABC123',
      transporterRaw: 'PRINORTH',
    });
    const outlierDate = new Date('2025-01-30T00:00:00.000Z');
    await seedPosting({
      vehicleId: 'veh-2',
      sourceId: String(src2._id),
      amount: 642,
      reportingAmount: 642,
      periodStart: outlierDate,
      periodEnd: outlierDate,
    });

    await seedException({ kind: 'rejected', sourceRowNumber: 2, column: 'registration', reason: 'Truck registration number is required' });
    await seedException({
      kind: 'duplicate',
      sourceRowNumber: 3,
      column: undefined,
      invalidValue: undefined,
      reason: 'Looks like a duplicate of an existing third-party record for AGL8230 on Mon Jan 05 2026',
      rawRow: { date: '05.01.26', registration: 'AGL8230', transporter: 'SIGHTSCORE', amount: 100 },
    });

    const result = await makeService().getDataQualityExceptions(contextFor(null), JAN_START, JAN_END);

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      kind: 'rejected',
      sourceRowNumber: 2,
      column: 'registration',
      reason: 'Truck registration number is required',
    });

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]).toMatchObject({ kind: 'duplicate', sourceRowNumber: 3 });

    expect(result.periodOutliers).toHaveLength(1);
    expect(result.periodOutliers[0]).toMatchObject({
      kind: 'period-outlier',
      sourceRowNumber: 93,
      rawDate: '30.01.25',
      rawRegistration: 'ABC123',
      rawTransporter: 'PRINORTH',
      amount: '642',
    });
    expect(result.periodOutliers[0].reason).toContain('2025-01-30');
  });

  it('finds a rejected row by batch membership even when the row itself has no parseable date', async () => {
    const src1 = await seedSourceRecord();
    await seedPosting({ vehicleId: 'veh-1', sourceId: String(src1._id), amount: 100, reportingAmount: 100 });

    // Rejected specifically BECAUSE its date is missing/unparseable --
    // filtering by the exception's own date would silently drop this row.
    await seedException({
      kind: 'rejected',
      sourceRowNumber: 5,
      column: 'date',
      reason: 'Date is missing or not in a recognised format',
      rawRow: { date: '', registration: 'XYZ999', transporter: 'PRINORTH', amount: 80 },
    });

    const result = await makeService().getDataQualityExceptions(contextFor(null), JAN_START, JAN_END);

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].sourceRowNumber).toBe(5);
    expect(result.rejected[0].rawDate).toBeUndefined();
  });

  it('returns nothing for a period no import batch touched', async () => {
    const result = await makeService().getDataQualityExceptions(contextFor(null), JAN_START, JAN_END);
    expect(result).toEqual({ periodStart: JAN_START, periodEnd: JAN_END, rejected: [], duplicates: [], periodOutliers: [] });
  });

  it('rejects an inverted period range', async () => {
    await expect(makeService().getDataQualityExceptions(contextFor(null), JAN_END, JAN_START)).rejects.toThrow();
  });
});
