// tests/security/transport-cost-command-centre.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 4. Adversarial coverage for the
// Command Centre summary that the milestone's own "SECURITY" section
// calls out by name: tenant isolation, org-unit isolation, empty scope,
// unauthorized permission, filter bypass, customer/destination filter
// leakage, multi-line duplicate counting, ledger/source mismatch, date
// boundary errors, company filter correctness, and no ledger mutation.
//
// Tenant/org-unit/empty-scope/multi-line/date-boundary correctness is
// ALSO proven in depth by
// tests/unit/transport-cost/transport-cost-command-centre.service.spec.ts
// (real pipeline, not mocked) -- this file adds the specifically
// adversarial angles that spec does not already cover: a filter used as
// a scope-bypass attempt, and the route's own permission wiring.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

describe('Command Centre route: permission wiring (item 20 -- unauthorized access)', () => {
  it('GET /api/transport-cost/command-centre/summary is wrapped in withAuth and requires TRANSPORT_COST_VIEW', () => {
    const routeFile = path.join(ROOT, 'app/api/transport-cost/command-centre/summary/route.ts');
    const source = fs.readFileSync(routeFile, 'utf8');
    expect(source).toContain('withAuth(');
    expect(source).toContain('Permission.TRANSPORT_COST_VIEW');
    // Never a manage-level permission for a read-only summary, and never
    // left ungated (no bare export without withAuth).
    expect(source).not.toContain('Permission.TRANSPORT_COST_MANAGE');
  });
});

jest.mock('../../modules/finance/repositories/allocation-ledger.repository', () => {
  const actual = jest.requireActual('../../modules/finance/repositories/allocation-ledger.repository');
  const { FakeCollection } = jest.requireActual('../helpers/fake-collection');
  const collection = new FakeCollection();
  class TestRepo extends actual.AllocationLedgerRepository {
    async getCollection() {
      return collection;
    }
  }
  return { __esModule: true, ...actual, allocationLedgerRepository: new TestRepo(), __fakeCollection: collection };
});

jest.mock('../../modules/transport-cost/repositories/transport-cost-source-record.repository', () => {
  const actual = jest.requireActual('../../modules/transport-cost/repositories/transport-cost-source-record.repository');
  const { FakeCollection } = jest.requireActual('../helpers/fake-collection');
  const collection = new FakeCollection();
  class TestRepo extends actual.TransportCostSourceRecordRepository {
    async getCollection() {
      return collection;
    }
  }
  return { __esModule: true, ...actual, transportCostSourceRecordRepository: new TestRepo(), __fakeCollection: collection };
});

jest.mock('../../modules/transport-cost/repositories/transport-cost-import-exception.repository', () => {
  const actual = jest.requireActual('../../modules/transport-cost/repositories/transport-cost-import-exception.repository');
  const { FakeCollection } = jest.requireActual('../helpers/fake-collection');
  const collection = new FakeCollection();
  class TestRepo extends actual.TransportCostImportExceptionRepository {
    async getCollection() {
      return collection;
    }
  }
  return { __esModule: true, ...actual, transportCostImportExceptionRepository: new TestRepo(), __fakeCollection: collection };
});

import { TransportCostReportService } from '../../modules/transport-cost/services/transport-cost-report.service';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { allocationLedgerRepository, __fakeCollection: fakeLedger } = require('../../modules/finance/repositories/allocation-ledger.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transportCostSourceRecordRepository, __fakeCollection: fakeSource } = require('../../modules/transport-cost/repositories/transport-cost-source-record.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transportCostImportExceptionRepository, __fakeCollection: fakeExceptions } = require('../../modules/transport-cost/repositories/transport-cost-import-exception.repository');

const TENANT = 'olivine-group-cc-sec';
const OTHER_TENANT = 'attacker-org-cc-sec';
const HARARE = 'unit-harare';
const JAN_START = new Date('2026-01-01T00:00:00.000Z');
const JAN_END = new Date('2026-01-31T23:59:59.999Z');

function contextFor(organizationId: string, accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId,
    organizationName: 'Test Org',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

function makeVehicleRepo(vehicles: any[]) {
  return {
    findAllConfirmed: jest.fn().mockResolvedValue(vehicles),
    findById: jest.fn().mockImplementation(async (id: string) => vehicles.find((v) => v._id === id) ?? null),
    findByTransporterPartnerId: jest.fn().mockImplementation(async (id: string) => vehicles.filter((v) => v.transporterPartnerId === id)),
  } as any;
}
function makePartnerRepo(partners: any[] = []) {
  return { findById: jest.fn().mockImplementation(async (id: string) => partners.find((p) => p._id === id) ?? null) } as any;
}
function makeSettingsService() {
  return { resolve: jest.fn().mockResolvedValue({ reportingCurrency: 'USD', fxPolicy: 'transaction-date', glToleranceAmount: 0, usingDefaults: true }) } as any;
}

function makeService(vehicles: any[] = [{ _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1' }]) {
  return new TransportCostReportService(
    makeVehicleRepo(vehicles),
    makePartnerRepo(),
    makeSettingsService(),
    allocationLedgerRepository,
    transportCostSourceRecordRepository,
    transportCostImportExceptionRepository
  );
}

async function seedSourceRecord(tenantId: string, overrides: Record<string, unknown> = {}) {
  return transportCostSourceRecordRepository.create(
    {
      orgUnitId: HARARE,
      sheetFamily: 'third-party',
      importBatchId: 'batch-1',
      sourceFileName: 'JAN-26 3rd Party.xlsx',
      sourceRowNumber: 1,
      importedAt: JAN_START,
      rawRow: {},
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
    tenantId,
    'user-1'
  );
}

async function seedPosting(tenantId: string, sourceId: string, overrides: Record<string, unknown> = {}) {
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
    tenantId,
    'user-1'
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

describe('Command Centre: customer/destination filter cannot leak another tenant\'s data (filter bypass / leakage)', () => {
  it('a destinationTown filter that matches another tenant\'s record still returns nothing for this tenant', async () => {
    const attacker = await seedSourceRecord(OTHER_TENANT, { destinationTown: 'SecretDepot' });
    await seedPosting(OTHER_TENANT, attacker._id!, { reportingAmount: 55555, amount: 55555 });

    const summary = await makeService().getCommandCentreSummary(contextFor(TENANT, null), JAN_START, JAN_END, 'month', {
      destinationTown: 'SecretDepot',
    });

    expect(summary.totals).toEqual([]);
    expect(summary.byDestination).toEqual([]);
  });

  it('a customerName filter cannot be used to enumerate postings outside the caller\'s org-unit scope', async () => {
    const outOfScope = await seedSourceRecord(TENANT, { orgUnitId: 'unit-bulawayo', customerName: 'Target Customer' });
    await seedPosting(TENANT, outOfScope._id!, { orgUnitId: 'unit-bulawayo', reportingAmount: 4321, amount: 4321 });

    const summary = await makeService().getCommandCentreSummary(contextFor(TENANT, [HARARE]), JAN_START, JAN_END, 'month', {
      customerName: 'Target Customer',
    });

    expect(summary.totals).toEqual([]);
  });
});

describe('Command Centre: contradictory filters fail closed rather than silently picking one (filter bypass)', () => {
  it('a vehicleId that does not belong to the given transporterPartnerId returns nothing, never the vehicle\'s data under a different transporter', async () => {
    const vehicles = [
      { _id: 'veh-1', registration: 'AGL8230', transporterPartnerId: 'p-1' },
      { _id: 'veh-2', registration: 'AFJ5203', transporterPartnerId: 'p-2' },
    ];
    const src = await seedSourceRecord(TENANT, { contractedVehicleId: 'veh-2' });
    await seedPosting(TENANT, src._id!, { vehicleId: 'veh-2' });

    const summary = await makeService(vehicles).getCommandCentreSummary(contextFor(TENANT, null), JAN_START, JAN_END, 'month', {
      vehicleId: 'veh-2',
      transporterPartnerId: 'p-1', // veh-2 does NOT belong to p-1
    });

    expect(summary.totals).toEqual([]);
  });
});

describe('Command Centre: no ledger mutation (item 24)', () => {
  it('the append-only ledger repository this service reads through still refuses update/softDelete/hardDelete', async () => {
    await expect(allocationLedgerRepository.update()).rejects.toThrow(/append-only/);
    await expect(allocationLedgerRepository.softDelete()).rejects.toThrow(/append-only/);
    await expect(allocationLedgerRepository.hardDelete()).rejects.toThrow(/append-only/);
  });

  it('getCommandCentreSummary never calls append -- a read path cannot also be a write path', async () => {
    const src = await seedSourceRecord(TENANT);
    await seedPosting(TENANT, src._id!);

    const appendSpy = jest.spyOn(allocationLedgerRepository, 'append');
    await makeService().getCommandCentreSummary(contextFor(TENANT, null), JAN_START, JAN_END, 'month');
    expect(appendSpy).not.toHaveBeenCalled();
    appendSpy.mockRestore();
  });
});

describe('Command Centre: company filter correctness', () => {
  it('a company filter never leaks a DIFFERENT company\'s postings into the filtered total', async () => {
    const hypery = await seedSourceRecord(TENANT, { sourceRowNumber: 1, costFacingCompany: 'hypery' });
    await seedPosting(TENANT, hypery._id!, { costFacingCompany: 'hypery', reportingAmount: 111, amount: 111 });
    const surface = await seedSourceRecord(TENANT, { sourceRowNumber: 2, costFacingCompany: 'surface' });
    await seedPosting(TENANT, surface._id!, { costFacingCompany: 'surface', reportingAmount: 222, amount: 222 });

    const summary = await makeService().getCommandCentreSummary(contextFor(TENANT, null), JAN_START, JAN_END, 'month', {
      costFacingCompany: 'hypery',
    });

    expect(summary.totals).toEqual([{ key: 'total', label: 'Total', reportingCurrency: 'USD', netReportingAmount: 111, postingCount: 1 }]);
    expect(summary.byCompany).toEqual([expect.objectContaining({ key: 'hypery', netReportingAmount: 111 })]);
  });
});
