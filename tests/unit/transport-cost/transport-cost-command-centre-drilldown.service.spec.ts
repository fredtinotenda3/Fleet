// tests/unit/transport-cost/transport-cost-command-centre-drilldown.service.spec.ts
//
// GAP-CLOSURE PASS, Objective 4 ("Command Centre Slice B/C" --
// drill-down/evidence/traceability). Exercises
// TransportCostReportService.getCommandCentreDrillDown and
// getDataQualityIssueEvidence against the SAME real-repository-over-
// FakeCollection pattern transport-cost-command-centre.service.spec.ts
// (getCommandCentreSummary) uses, so the drill-down is proven against
// the actual pipeline, not a mock of it -- and, critically, proven to
// RECONCILE against the summary's own bars, not just tested in
// isolation.

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

import { TransportCostReportService, COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT } from '../../../modules/transport-cost/services/transport-cost-report.service';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { allocationLedgerRepository, __fakeCollection: fakeLedger } = require('../../../modules/finance/repositories/allocation-ledger.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transportCostSourceRecordRepository, __fakeCollection: fakeSource } = require('../../../modules/transport-cost/repositories/transport-cost-source-record.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transportCostImportExceptionRepository, __fakeCollection: fakeExceptions } = require('../../../modules/transport-cost/repositories/transport-cost-import-exception.repository');

const TENANT = 'olivine-group-dd-svc';
const OTHER_TENANT = 'toyota-zimbabwe-dd-svc';
const HARARE = 'unit-harare-dd';
const BULAWAYO = 'unit-bulawayo-dd';
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

let rowSeq = 0;

async function seedSourceRecord(overrides: Record<string, unknown> = {}) {
  rowSeq += 1;
  return transportCostSourceRecordRepository.create(
    {
      orgUnitId: HARARE,
      sheetFamily: 'third-party',
      importBatchId: 'batch-1',
      sourceFileName: 'JAN-26 3rd Party.xlsx',
      sourceRowNumber: rowSeq,
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
  rowSeq = 0;
});

describe('getCommandCentreDrillDown -- reconciles to the summary bar it was opened from', () => {
  it('a company-constrained drill-down\'s total equals that exact company\'s bar in the summary', async () => {
    const olivine = await seedSourceRecord({ costFacingCompany: 'olivine' });
    await seedPosting(olivine._id!, { costFacingCompany: 'olivine', reportingAmount: 300, amount: 300 });
    const hypery = await seedSourceRecord({ sourceRowNumber: 2, costFacingCompany: 'hypery' });
    await seedPosting(hypery._id!, { costFacingCompany: 'hypery', reportingAmount: 50, amount: 50 });

    const service = makeService();
    const summary = await service.getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    const olivineBar = summary.byCompany.find((c) => c.key === 'olivine')!;
    expect(olivineBar.netReportingAmount).toBe(300);

    const drillDown = await service.getCommandCentreDrillDown(contextFor(null), JAN_START, JAN_END, {}, { dimension: 'company', key: 'olivine' });
    expect(drillDown.totals).toEqual([{ key: 'total', label: 'Total', reportingCurrency: 'USD', netReportingAmount: 300, postingCount: 1 }]);
    expect(drillDown.rows).toHaveLength(1);
    expect(drillDown.rows[0].sourceRecordId).toBe(olivine._id);
    expect(drillDown.rows[0].costFacingCompany).toBe('olivine');
  });

  it('a transporter-constrained drill-down never leaks a different transporter\'s postings', async () => {
    const service = new TransportCostReportService(
      makeVehicleRepo([
        { _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1' },
        { _id: 'veh-2', registration: 'AFJ5203', transporterPartnerId: 'p-2' },
      ]),
      makePartnerRepo([
        { _id: 'p-1', canonicalName: 'SIGHTSCORE' },
        { _id: 'p-2', canonicalName: 'SHARMIC' },
      ]),
      makeSettingsService(),
      allocationLedgerRepository,
      transportCostSourceRecordRepository,
      transportCostImportExceptionRepository
    );

    const src1 = await seedSourceRecord({ contractedVehicleId: 'veh-1' });
    await seedPosting(src1._id!, { vehicleId: 'veh-1', reportingAmount: 100, amount: 100 });
    const src2 = await seedSourceRecord({ sourceRowNumber: 2, contractedVehicleId: 'veh-2' });
    await seedPosting(src2._id!, { vehicleId: 'veh-2', reportingAmount: 999, amount: 999 });

    const drillDown = await service.getCommandCentreDrillDown(contextFor(null), JAN_START, JAN_END, {}, { dimension: 'transporter', key: 'p-1' });
    expect(drillDown.rows).toHaveLength(1);
    expect(drillDown.rows[0].vehicleId).toBe('veh-1');
    expect(drillDown.rows.every((r) => r.transporterPartnerId === 'p-1')).toBe(true);
    expect(drillDown.label).toBe('SIGHTSCORE');
  });

  it('a destination-constrained drill-down uses the PRIMARY (flat) field, matching byDestination\'s own bucketing -- never the broader filter match', async () => {
    // Two-line operation: flat destination Harare, line 2 names Mutare.
    // byDestination buckets this under Harare only (see
    // destinationBucketKey's own header) -- the drill-down for "Mutare"
    // must therefore be EMPTY, not include this operation, even though a
    // destinationTown=Mutare FILTER (a different code path) would match it.
    const src = await seedSourceRecord({
      destinationTown: 'Harare',
      lines: [
        { lineNumber: 1, destinationTown: 'Harare' },
        { lineNumber: 2, destinationTown: 'Mutare' },
      ],
    });
    await seedPosting(src._id!, { reportingAmount: 300, amount: 300 });

    const service = makeService();
    const forMutare = await service.getCommandCentreDrillDown(contextFor(null), JAN_START, JAN_END, {}, { dimension: 'destination', key: 'Mutare' });
    expect(forMutare.rows).toHaveLength(0);
    expect(forMutare.totals).toEqual([]);

    const forHarare = await service.getCommandCentreDrillDown(contextFor(null), JAN_START, JAN_END, {}, { dimension: 'destination', key: 'Harare' });
    expect(forHarare.rows).toHaveLength(1);
    expect(forHarare.totals[0].netReportingAmount).toBe(300);
  });

  it('a category-constrained drill-down matches byCategory exactly', async () => {
    const src1 = await seedSourceRecord();
    await seedPosting(src1._id!, { costCategory: 'stock-transfer', reportingAmount: 100, amount: 100 });
    const src2 = await seedSourceRecord({ sourceRowNumber: 2 });
    await seedPosting(src2._id!, { costCategory: 'third-party-transport', reportingAmount: 50, amount: 50 });

    const service = makeService();
    const drillDown = await service.getCommandCentreDrillDown(contextFor(null), JAN_START, JAN_END, {}, { dimension: 'category', key: 'stock-transfer' });
    expect(drillDown.rows).toHaveLength(1);
    expect(drillDown.rows[0].costCategory).toBe('stock-transfer');
    expect(drillDown.label).toBe('Stock transfer');
  });

  it('a customer-constrained drill-down never double-counts a multi-line operation', async () => {
    // Same shape as the summary's own "critical correctness requirement"
    // test -- one posting, three lines, filtered/constrained by a
    // NON-primary line's customer.
    const src = await seedSourceRecord({
      customerName: 'Customer A',
      lines: [
        { lineNumber: 1, customerName: 'Customer A', tonnageRaw: 2 },
        { lineNumber: 2, customerName: 'Customer B', tonnageRaw: 3 },
      ],
    });
    await seedPosting(src._id!, { reportingAmount: 300, amount: 300 });

    const service = makeService();
    // byCustomer buckets by the PRIMARY (line-1) field -- "Customer A" --
    // so a drill-down constrained to "Customer B" must be empty (it
    // never appeared as its own bar), and "Customer A" must return
    // exactly one row, never one row per line.
    const forCustomerB = await service.getCommandCentreDrillDown(contextFor(null), JAN_START, JAN_END, {}, { dimension: 'customer', key: 'Customer B' });
    expect(forCustomerB.rows).toHaveLength(0);

    const forCustomerA = await service.getCommandCentreDrillDown(contextFor(null), JAN_START, JAN_END, {}, { dimension: 'customer', key: 'Customer A' });
    expect(forCustomerA.rows).toHaveLength(1);
    expect(forCustomerA.totals).toEqual([{ key: 'total', label: 'Total', reportingCurrency: 'USD', netReportingAmount: 300, postingCount: 1 }]);
  });

  it('an unconstrained drill-down (a trend-point click) returns every posting in the narrowed period, respecting other active filters', async () => {
    const src1 = await seedSourceRecord({ costFacingCompany: 'olivine' });
    await seedPosting(src1._id!, { periodStart: new Date('2026-01-05T00:00:00.000Z'), periodEnd: new Date('2026-01-05T00:00:00.000Z'), costFacingCompany: 'olivine' });
    const src2 = await seedSourceRecord({ sourceRowNumber: 2, costFacingCompany: 'hypery' });
    await seedPosting(src2._id!, { periodStart: new Date('2026-01-05T00:00:00.000Z'), periodEnd: new Date('2026-01-05T00:00:00.000Z'), costFacingCompany: 'hypery', reportingAmount: 50, amount: 50 });
    // A posting on a DIFFERENT day -- must not appear when the drill-down's own period is narrowed to Jan 5 only.
    const src3 = await seedSourceRecord({ sourceRowNumber: 3 });
    await seedPosting(src3._id!, { periodStart: new Date('2026-01-06T00:00:00.000Z'), periodEnd: new Date('2026-01-06T00:00:00.000Z'), reportingAmount: 999, amount: 999 });

    const service = makeService();
    const dayStart = new Date('2026-01-05T00:00:00.000Z');
    const dayEnd = new Date('2026-01-05T23:59:59.999Z');
    const allCompanies = await service.getCommandCentreDrillDown(contextFor(null), dayStart, dayEnd, {});
    expect(allCompanies.rows).toHaveLength(2);
    expect(allCompanies.totals[0].netReportingAmount).toBe(150);

    const olivineOnly = await service.getCommandCentreDrillDown(contextFor(null), dayStart, dayEnd, { costFacingCompany: 'olivine' });
    expect(olivineOnly.rows).toHaveLength(1);
    expect(olivineOnly.totals[0].netReportingAmount).toBe(100);
  });

  it('caps the returned rows at COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT and sets truncated, while `totals` still reconciles to the FULL matching set', async () => {
    const count = COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT + 3;
    const creates: Array<Promise<unknown>> = [];
    for (let i = 0; i < count; i += 1) {
      creates.push(
        (async () => {
          const src = await seedSourceRecord({ sourceRowNumber: i + 1 });
          await seedPosting(src._id!, { reportingAmount: 10, amount: 10 });
        })()
      );
    }
    await Promise.all(creates);

    const service = makeService();
    const drillDown = await service.getCommandCentreDrillDown(contextFor(null), JAN_START, JAN_END, {});
    expect(drillDown.rows).toHaveLength(COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT);
    expect(drillDown.truncated).toBe(true);
    expect(drillDown.rowCount).toBe(count);
    expect(drillDown.totals[0].netReportingAmount).toBe(count * 10);
    expect(drillDown.totals[0].postingCount).toBe(count);
  }, 30000);

  it('excludes another tenant\'s and another org-unit\'s postings, same as the summary', async () => {
    const mine = await seedSourceRecord({ orgUnitId: HARARE });
    await seedPosting(mine._id!, { orgUnitId: HARARE });
    const otherOrgUnit = await seedSourceRecord({ sourceRowNumber: 2, orgUnitId: BULAWAYO });
    await seedPosting(otherOrgUnit._id!, { orgUnitId: BULAWAYO, reportingAmount: 500, amount: 500 });
    const otherTenantSrc = await transportCostSourceRecordRepository.create(
      { orgUnitId: HARARE, sheetFamily: 'third-party', importBatchId: 'b', sourceFileName: 'x', sourceRowNumber: 1, importedAt: JAN_START, rawRow: {}, date: JAN_START, rawDate: '', registration: 'X', registrationRaw: 'X', transporterNormalized: null, transporterRaw: '', amount: 9999, tonnageRaw: null },
      OTHER_TENANT,
      'u'
    );
    await allocationLedgerRepository.append(
      { orgUnitId: HARARE, vehicleId: 'veh-9', costCategory: 'third-party-transport', allocationRule: 'direct', sourceCollection: 'tbltransportcostsourcerecords', sourceId: otherTenantSrc._id!, periodStart: JAN_START, periodEnd: JAN_START, currency: 'USD', amount: 9999, fxRate: 1, fxRateDate: JAN_START, fxSource: 'organization-default', reportingCurrency: 'USD', reportingAmount: 9999, postedBy: 'u', postedAt: JAN_START },
      OTHER_TENANT,
      'u'
    );

    const service = makeService();
    const hararOnly = await service.getCommandCentreDrillDown(contextFor([HARARE]), JAN_START, JAN_END, {});
    expect(hararOnly.rows).toHaveLength(1);
    expect(hararOnly.rows[0].sourceRecordId).toBe(mine._id);

    const empty = await service.getCommandCentreDrillDown(contextFor([]), JAN_START, JAN_END, {});
    expect(empty.rows).toHaveLength(0);
    expect(empty.rowCount).toBe(0);
  });

  it('rejects an inverted or over-wide period range, same guard as the summary', async () => {
    const service = makeService();
    await expect(service.getCommandCentreDrillDown(contextFor(null), JAN_END, JAN_START, {})).rejects.toThrow();
    await expect(
      service.getCommandCentreDrillDown(contextFor(null), new Date('2020-01-01'), new Date('2026-01-01'), {})
    ).rejects.toThrow();
  });
});

describe('getDataQualityIssueEvidence -- the exact rows behind one trust-panel count', () => {
  it('returns precisely the rows getDataQualityBreakdown counted for "unresolvedTransporter", never more or fewer', async () => {
    await seedSourceRecord({ transporterRaw: 'UNKNOWN CARRIER', transporterPartnerId: null });
    await seedSourceRecord({ sourceRowNumber: 2, transporterRaw: 'SIGHTSCORE', transporterPartnerId: 'p-1' });
    await seedSourceRecord({ sourceRowNumber: 3, transporterRaw: 'ANOTHER UNKNOWN', transporterPartnerId: null });

    const service = makeService();
    const breakdown = await transportCostSourceRecordRepository.getDataQualityBreakdown(JAN_START, JAN_END, contextFor(null));
    expect(breakdown.unresolvedTransporter).toBe(2);

    const evidence = await service.getDataQualityIssueEvidence(contextFor(null), 'unresolvedTransporter', JAN_START, JAN_END);
    expect(evidence.rowCount).toBe(2);
    expect(evidence.rows).toHaveLength(2);
    expect(evidence.rows.every((r) => r.transporterRaw === 'UNKNOWN CARRIER' || r.transporterRaw === 'ANOTHER UNKNOWN')).toBe(true);
  });

  it('returns an empty, honest result when nothing has the issue -- never a fabricated row', async () => {
    await seedSourceRecord({ transporterRaw: 'SIGHTSCORE', transporterPartnerId: 'p-1' });

    const service = makeService();
    const evidence = await service.getDataQualityIssueEvidence(contextFor(null), 'unresolvedTransporter', JAN_START, JAN_END);
    expect(evidence.rows).toEqual([]);
    expect(evidence.rowCount).toBe(0);
    expect(evidence.truncated).toBe(false);
  });

  it('a Swift row with no registration is vehicleNotApplicable, never unresolvedVehicle or missingRegistration', async () => {
    await seedSourceRecord({ sheetFamily: 'swift', registration: null, registrationRaw: '' });

    const service = makeService();
    const applicable = await service.getDataQualityIssueEvidence(contextFor(null), 'vehicleNotApplicable', JAN_START, JAN_END);
    expect(applicable.rowCount).toBe(1);
    const unresolved = await service.getDataQualityIssueEvidence(contextFor(null), 'unresolvedVehicle', JAN_START, JAN_END);
    expect(unresolved.rowCount).toBe(0);
    const missing = await service.getDataQualityIssueEvidence(contextFor(null), 'missingRegistration', JAN_START, JAN_END);
    expect(missing.rowCount).toBe(0);
  });

  it('excludes another tenant\'s rows from the evidence list', async () => {
    await seedSourceRecord({ transporterRaw: 'UNKNOWN', transporterPartnerId: null });
    await transportCostSourceRecordRepository.create(
      { orgUnitId: HARARE, sheetFamily: 'third-party', importBatchId: 'b', sourceFileName: 'x', sourceRowNumber: 1, importedAt: JAN_START, rawRow: {}, date: JAN_START, rawDate: '', registration: 'X', registrationRaw: 'X', transporterNormalized: null, transporterRaw: 'OTHER UNKNOWN', amount: 9999, tonnageRaw: null },
      OTHER_TENANT,
      'u'
    );

    const service = makeService();
    const evidence = await service.getDataQualityIssueEvidence(contextFor(null), 'unresolvedTransporter', JAN_START, JAN_END);
    expect(evidence.rowCount).toBe(1);
    expect(evidence.rows[0].transporterRaw).toBe('UNKNOWN');
  });

  it('rejects an inverted period range', async () => {
    const service = makeService();
    await expect(service.getDataQualityIssueEvidence(contextFor(null), 'missingTonnage', JAN_END, JAN_START)).rejects.toThrow();
  });
});
