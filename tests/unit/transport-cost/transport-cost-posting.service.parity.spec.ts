// tests/unit/transport-cost/transport-cost-posting.service.parity.spec.ts
//
// ITEM 3: "TransportCostPostingService -> AllocationService: document
// which invariants it reimplements and which it skips, and add a test
// asserting parity with postAllocation's validation for the paths it
// does use."
//
// See transport-cost-posting.service.ts's own header for the full
// invariant-by-invariant comparison and the justification for choosing
// "document + test" over extracting a shared vehicle-resolution seam.
// This file is the "test" half of that: it calls the REAL
// AllocationService.postAllocation and the REAL
// TransportCostPostingService.postSourceRecord -- not reimplementations
// or copies of their logic -- against the SAME FakeCollection-backed
// ledger, for the three invariants TransportCostPostingService actually
// reuses from postAllocation's own code (not merely "behaves similarly
// to"):
//   1. currency is uppercased before it is stored (both call
//      `.toUpperCase()` on the resolved currency).
//   2. amount is rounded via the SAME imported `roundCurrency` utility
//      (not a re-implementation of rounding).
//   3. FX resolution is the SAME imported `resolveFxContext` utility,
//      and an unresolvable rate is refused rather than assumed 1:1 --
//      proven by driving both services with an identical foreign-
//      currency/no-rate scenario and confirming NEITHER posts.
//
// It deliberately does NOT assert parity on vehicle resolution
// (resolveVehicleInScope vs ContractedVehicle lookup), allocationRule
// validation, or idempotencyKey provenance -- those are the documented,
// deliberate divergences, not invariants either service claims to
// share. Asserting "parity" on a path that is supposed to differ would
// make this test a liability the moment either service's contract
// (correctly) diverges further.

jest.mock('@/infrastructure/monitoring/audit.logger', () => ({
  auditLog: { log: jest.fn(), logCreate: jest.fn(), logAction: jest.fn(), logUpdate: jest.fn() },
}));

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

// AllocationService.postAllocation is not constructor-injectable (it
// imports these as module-level singletons) -- mocked at the module
// boundary, same technique as the ledger mock above, rather than
// reaching into AllocationService's internals.
const FIXED_VEHICLE = {
  _id: 'veh-parity-1',
  tenantId: 'olivine-group-parity',
  orgUnitId: 'unit-harare',
  registration: 'AGL8230',
};
jest.mock('@/modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { findById: jest.fn().mockResolvedValue(FIXED_VEHICLE) },
}));

const FIXED_SETTINGS = {
  reportingCurrency: 'USD',
  fxPolicy: 'transaction-date',
  glToleranceAmount: 0,
  usingDefaults: true,
};
jest.mock('@/modules/finance/services/finance-settings.service', () => ({
  financeSettingsService: { resolve: jest.fn().mockResolvedValue(FIXED_SETTINGS) },
}));

import { allocationService } from '../../../modules/finance/services/allocation.service';
import { TransportCostPostingService } from '../../../modules/transport-cost/services/transport-cost-posting.service';
import type { TransportCostSourceRecord } from '../../../shared/types/transport-cost.types';
import type { ContractedVehicle } from '../../../shared/types/contracted-vehicle.types';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __fakeCollection: fakeCollection } = require('../../../modules/finance/repositories/allocation-ledger.repository');

const TENANT = 'olivine-group-parity';
const SOURCE_ID = 'src-parity-1';
const CONTRACTED_VEHICLE_ID = 'contracted-vehicle-parity-1';
const TX_DATE = new Date('2026-01-05T00:00:00.000Z');

function contextFor(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Olivine Group',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

function makeSourceRecord(overrides: Partial<TransportCostSourceRecord> = {}): TransportCostSourceRecord {
  return {
    _id: SOURCE_ID,
    tenantId: TENANT,
    orgUnitId: 'unit-harare',
    sheetFamily: 'third-party',
    importBatchId: 'batch-parity-1',
    sourceFileName: 'TRANSPORT_COST_JANUARY_2026.xlsx',
    sourceRowNumber: 2,
    importedAt: TX_DATE,
    rawRow: {},
    date: TX_DATE,
    rawDate: '05.01.26',
    registration: 'AGL8230',
    registrationRaw: 'AGL 8230',
    transporterNormalized: 'SIGHTSCORE',
    transporterRaw: 'Sightscore',
    amount: 837.456, // deliberately not pre-rounded -- see the rounding assertion below.
    tonnageRaw: null,
    contractedVehicleId: CONTRACTED_VEHICLE_ID,
    ...overrides,
  } as TransportCostSourceRecord;
}

function makeContractedVehicleRepo(vehicle: ContractedVehicle | null) {
  return { findById: jest.fn().mockResolvedValue(vehicle) } as any;
}

function makeSourceRepo(record: TransportCostSourceRecord | null) {
  return { findById: jest.fn().mockResolvedValue(record), findByImportBatch: jest.fn().mockResolvedValue(record ? [record] : []) } as any;
}

function makeVatConfigService(currency: string | undefined) {
  return {
    resolve: jest.fn().mockResolvedValue({
      sheetFamily: 'third-party',
      currency,
      vatBasis: 'unknown',
      isProvisionalDefault: true,
    }),
  } as any;
}

function makeSettingsService() {
  return { resolve: jest.fn().mockResolvedValue(FIXED_SETTINGS) } as any;
}

beforeEach(() => {
  fakeCollection.docs = [];
  fakeCollection.seenFilters = [];
  jest.clearAllMocks();
});

describe('TransportCostPostingService vs AllocationService.postAllocation -- shared-path parity', () => {
  it('both uppercase a lowercase currency before writing the posting (same .toUpperCase() call)', async () => {
    const transportCost = new TransportCostPostingService(
      makeSourceRepo(makeSourceRecord({ amount: 100 })),
      makeContractedVehicleRepo({ _id: CONTRACTED_VEHICLE_ID, tenantId: TENANT, registration: 'AGL8230' } as ContractedVehicle),
      makeVatConfigService('usd'), // lowercase on purpose
      makeSettingsService()
    );
    const tcOutcome = await transportCost.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    expect(tcOutcome.status).toBe('posted');
    if (tcOutcome.status !== 'posted') throw new Error('unreachable');
    expect(tcOutcome.posting.currency).toBe('USD');

    fakeCollection.docs = [];

    const allocation = await allocationService.postAllocation(contextFor(null), 'user-1', {
      vehicleId: FIXED_VEHICLE._id,
      costCategory: 'fuel',
      allocationRule: 'direct',
      sourceCollection: 'tblexpenses',
      sourceId: 'expense-parity-1',
      periodStart: TX_DATE,
      periodEnd: TX_DATE,
      currency: 'usd', // lowercase on purpose, same input shape
      amount: 100,
    });
    expect(allocation.currency).toBe('USD');
  });

  it('both round the posted amount via the same roundCurrency utility, not two different rounding rules', async () => {
    const transportCost = new TransportCostPostingService(
      makeSourceRepo(makeSourceRecord({ amount: 837.456 })),
      makeContractedVehicleRepo({ _id: CONTRACTED_VEHICLE_ID, tenantId: TENANT, registration: 'AGL8230' } as ContractedVehicle),
      makeVatConfigService('USD'),
      makeSettingsService()
    );
    const tcOutcome = await transportCost.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    expect(tcOutcome.status).toBe('posted');
    if (tcOutcome.status !== 'posted') throw new Error('unreachable');

    fakeCollection.docs = [];

    const allocation = await allocationService.postAllocation(contextFor(null), 'user-1', {
      vehicleId: FIXED_VEHICLE._id,
      costCategory: 'fuel',
      allocationRule: 'direct',
      sourceCollection: 'tblexpenses',
      sourceId: 'expense-parity-2',
      periodStart: TX_DATE,
      periodEnd: TX_DATE,
      currency: 'USD',
      amount: 837.456,
    });

    // Same input (837.456), same rounding function -> the same stored
    // amount, whichever service produced it.
    expect(tcOutcome.posting.amount).toBe(allocation.amount);
  });

  it('both refuse an unresolvable FX rate rather than assuming 1:1 -- neither posts', async () => {
    const transportCost = new TransportCostPostingService(
      makeSourceRepo(makeSourceRecord({ amount: 100 })),
      makeContractedVehicleRepo({ _id: CONTRACTED_VEHICLE_ID, tenantId: TENANT, registration: 'AGL8230' } as ContractedVehicle),
      makeVatConfigService('ZWL'), // foreign currency, no configured rate
      makeSettingsService()
    );
    const tcOutcome = await transportCost.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    expect(tcOutcome).toEqual({
      status: 'skipped',
      reason: 'unresolved-fx-rate',
      detail: expect.stringContaining('No exchange rate available'),
    });
    expect(fakeCollection.docs).toHaveLength(0);

    await expect(
      allocationService.postAllocation(contextFor(null), 'user-1', {
        vehicleId: FIXED_VEHICLE._id,
        costCategory: 'fuel',
        allocationRule: 'direct',
        sourceCollection: 'tblexpenses',
        sourceId: 'expense-parity-3',
        periodStart: TX_DATE,
        periodEnd: TX_DATE,
        currency: 'ZWL',
        amount: 100,
      })
    ).rejects.toThrow(/No FX rate available/);
    expect(fakeCollection.docs).toHaveLength(0);
  });
});
