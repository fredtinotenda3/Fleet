// tests/unit/transport-cost/transport-cost-posting.service.spec.ts
//
// Phase O3. Exercises TransportCostPostingService against a REAL
// AllocationLedgerRepository backed by tests/helpers/fake-collection.ts
// (the same pattern tests/security/allocation-ledger-append-only.spec.ts
// uses for the repository alone) -- so append-only/idempotency/reversal
// behaviour is proven through the actual aggregation and write logic,
// not a mock of it. AllocationService.reversePosting is also exercised
// for real, by mocking the allocation-ledger repository MODULE so both
// TransportCostPostingService's injected ledger repo and
// AllocationService's internal singleton resolve to the SAME
// FakeCollection-backed instance.
//
// Covers the exact verification points the Phase O3 delivery requires:
//  - idempotent replay is a no-op (no new row)
//  - "re-import twice" produces zero duplicate postings
//  - a corrected row produces a reversal + a new posting (3 ledger rows
//    total), and the ORIGINAL row is never mutated (byte-identical)
//  - a same-amount recompute after a correction is again a no-op
//  - a null Amount is refused, never zero-filled
//  - an unresolved currency / unresolvable FX rate is refused, never guessed
//  - Vansales posts TOTAL under transport-retainer with the declared
//    periodMonth as periodStart/periodEnd (Option A), with the same
//    idempotency/correction discipline as 3rd Party, and is refused
//    (never guessed) with no TOTAL or no valid periodMonth
//  - an unresolved vehicle identity is refused
//  - org-unit scope is enforced (404, not silently empty)
//  - reversing an already-reversed posting is refused (race guard)

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

import { TransportCostPostingService } from '../../../modules/transport-cost/services/transport-cost-posting.service';
import { NotFoundError, ConflictError } from '../../../server/errors/app.errors';
import type { TransportCostSourceRecord } from '../../../shared/types/transport-cost.types';
import type { ContractedVehicle } from '../../../shared/types/contracted-vehicle.types';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __fakeCollection: fakeCollection } = require('../../../modules/finance/repositories/allocation-ledger.repository');

const TENANT = 'olivine-group-o3';
const HARARE = 'unit-harare';
const SOURCE_ID = 'src-record-1';
const VEHICLE_ID = 'contracted-vehicle-1';

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
    orgUnitId: HARARE,
    sheetFamily: 'third-party',
    importBatchId: 'batch-1',
    sourceFileName: 'TRANSPORT_COST_JANUARY_2026.xlsx',
    sourceRowNumber: 2,
    importedAt: new Date('2026-02-01T00:00:00.000Z'),
    rawRow: {},
    date: new Date('2026-01-05T00:00:00.000Z'),
    rawDate: '05.01.26',
    registration: 'AGL8230',
    registrationRaw: 'AGL 8230',
    transporterNormalized: 'SIGHTSCORE',
    transporterRaw: 'Sightscore',
    destinationTown: 'BULAWAYO',
    amount: 837,
    tonnageRaw: 13500,
    contractedVehicleId: VEHICLE_ID,
    ...overrides,
  } as TransportCostSourceRecord;
}

function makeVehicle(overrides: Partial<ContractedVehicle> = {}): ContractedVehicle {
  return {
    _id: VEHICLE_ID,
    tenantId: TENANT,
    registration: 'AGL8230',
    registrationRaw: 'AGL 8230',
    transporterPartnerId: 'partner-1',
    isMultiPlate: false,
    reviewStatus: 'confirmed',
    firstSeenSourceRecordId: SOURCE_ID,
    ...overrides,
  } as ContractedVehicle;
}

function makeSourceRepo(record: TransportCostSourceRecord | null, extra: Record<string, jest.Mock> = {}) {
  return {
    findById: jest.fn().mockResolvedValue(record),
    findByImportBatch: jest.fn().mockResolvedValue(record ? [record] : []),
    ...extra,
  } as any;
}

function makeVehicleRepo(vehicle: ContractedVehicle | null) {
  return { findById: jest.fn().mockResolvedValue(vehicle) } as any;
}

function makeVatConfigService(currency: string | undefined = 'USD') {
  return {
    resolve: jest.fn().mockResolvedValue({
      sheetFamily: 'third-party',
      currency,
      vatBasis: 'unknown',
      isProvisionalDefault: true,
    }),
  } as any;
}

function makeSettingsService(reportingCurrency = 'USD') {
  return {
    resolve: jest.fn().mockResolvedValue({
      reportingCurrency,
      fxPolicy: 'transaction-date',
      glToleranceAmount: 0,
      usingDefaults: true,
    }),
  } as any;
}

function buildService(params: {
  record?: TransportCostSourceRecord | null;
  vehicle?: ContractedVehicle | null;
  currency?: string | undefined;
  reportingCurrency?: string;
  sourceRepoOverrides?: Record<string, jest.Mock>;
}) {
  const record = params.record === undefined ? makeSourceRecord() : params.record;
  const vehicle = params.vehicle === undefined ? makeVehicle() : params.vehicle;
  return new TransportCostPostingService(
    makeSourceRepo(record, params.sourceRepoOverrides),
    makeVehicleRepo(vehicle),
    makeVatConfigService(params.currency),
    makeSettingsService(params.reportingCurrency)
  );
}

beforeEach(() => {
  fakeCollection.docs = [];
  fakeCollection.seenFilters = [];
  jest.clearAllMocks();
});

describe('TransportCostPostingService.postSourceRecord -- happy path', () => {
  it('posts a new source record, deriving vehicleId/orgUnitId from the source', async () => {
    const service = buildService({});
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(outcome.status).toBe('posted');
    if (outcome.status !== 'posted') throw new Error('unreachable');
    expect(outcome.posting.vehicleId).toBe(VEHICLE_ID);
    expect(outcome.posting.orgUnitId).toBe(HARARE);
    expect(outcome.posting.costCategory).toBe('third-party-transport');
    expect(outcome.posting.sourceCollection).toBe('tbltransportcostsourcerecords');
    expect(outcome.posting.amount).toBe(837);
    expect(outcome.posting.currency).toBe('USD');
    expect(outcome.posting.idempotencyKey).toMatch(/:v1$/);
    expect(fakeCollection.docs).toHaveLength(1);
  });
});

describe('TransportCostPostingService.postSourceRecord -- Vansales (periodization Option A)', () => {
  function makeVansalesRecord(overrides: Partial<TransportCostSourceRecord> = {}) {
    return makeSourceRecord({
      sheetFamily: 'vansales',
      date: null,
      rawDate: '',
      amount: null,
      vansales: {
        payerName: 'Mr Gurjit',
        product: 'Golden Glow 2L',
        monthlyCostBeforeVat: 1150,
        weeklyAmounts: [300, 300, null, 300],
        total: 1200,
        periodMonth: '2026-01',
      },
      ...overrides,
    });
  }

  it('posts TOTAL under transport-retainer, with the declared month as periodStart/periodEnd', async () => {
    const service = buildService({ record: makeVansalesRecord() });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(outcome.status).toBe('posted');
    if (outcome.status !== 'posted') throw new Error('unreachable');
    expect(outcome.posting.costCategory).toBe('transport-retainer');
    expect(outcome.posting.amount).toBe(1200); // TOTAL, never monthlyCostBeforeVat or a re-summed weeklyAmounts
    expect(outcome.posting.periodStart).toEqual(new Date(2026, 0, 1));
    expect(outcome.posting.periodEnd).toEqual(new Date(2026, 0, 31));
    expect(outcome.posting.description).toContain('Mr Gurjit');
    expect(fakeCollection.docs).toHaveLength(1);
  });

  it('a second call with no change is a no-op, not a new row (same idempotency discipline as 3rd Party)', async () => {
    const service = buildService({ record: makeVansalesRecord() });
    const first = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    const second = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(second.status).toBe('unchanged');
    if (first.status !== 'posted' || second.status !== 'unchanged') throw new Error('unreachable');
    expect(String(second.posting._id)).toBe(String(first.posting._id));
    expect(fakeCollection.docs).toHaveLength(1);
  });

  it('a changed TOTAL reverses the original and appends a corrected posting, never mutating the original', async () => {
    const service = buildService({ record: makeVansalesRecord() });
    const first = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    if (first.status !== 'posted') throw new Error('unreachable');
    const originalSnapshot = JSON.parse(JSON.stringify(first.posting));

    const correctedService = buildService({
      record: makeVansalesRecord({ vansales: { payerName: 'Mr Gurjit', product: 'Golden Glow 2L', monthlyCostBeforeVat: 1150, weeklyAmounts: [300, 300, null, 300], total: 1350, periodMonth: '2026-01' } }),
    });
    const second = await correctedService.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(second.status).toBe('corrected');
    if (second.status !== 'corrected') throw new Error('unreachable');
    expect(second.reversal.reversalOfPostingId).toBe(String(first.posting._id));
    expect(second.posting.amount).toBe(1350);
    expect(fakeCollection.docs).toHaveLength(3); // original + reversal + corrected
    const storedOriginal = fakeCollection.docs.find((d: any) => String(d._id) === String(first.posting._id));
    expect(JSON.parse(JSON.stringify(storedOriginal))).toMatchObject(
      Object.fromEntries(Object.entries(originalSnapshot).filter(([k]) => k !== 'updatedAt'))
    );
  });

  it('a 3rd Party and a Vansales posting for the same tenant never collide on idempotencyKey (different costCategory)', async () => {
    const thirdParty = buildService({ record: makeSourceRecord() });
    const thirdPartyOutcome = await thirdParty.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    const vansales = buildService({ record: makeVansalesRecord() });
    const vansalesOutcome = await vansales.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    if (thirdPartyOutcome.status !== 'posted' || vansalesOutcome.status !== 'posted') throw new Error('unreachable');
    expect(thirdPartyOutcome.posting.idempotencyKey).not.toBe(vansalesOutcome.posting.idempotencyKey);
    expect(fakeCollection.docs).toHaveLength(2);
  });
});

describe('TransportCostPostingService.postSourceRecord -- idempotent replay', () => {
  it('a second call with no change is a no-op, not a new row', async () => {
    const service = buildService({});
    const first = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    const second = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(second.status).toBe('unchanged');
    if (first.status !== 'posted' || second.status !== 'unchanged') throw new Error('unreachable');
    expect(String(second.posting._id)).toBe(String(first.posting._id));
    expect(fakeCollection.docs).toHaveLength(1);
  });

  it('REGRESSION: re-importing/re-posting the same row TWICE produces zero duplicate postings', async () => {
    const service = buildService({});
    await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(fakeCollection.docs).toHaveLength(1);
    expect(fakeCollection.docs.filter((d: any) => !d.reversalOfPostingId)).toHaveLength(1);
  });
});

describe('TransportCostPostingService.postSourceRecord -- correction', () => {
  it('an amount change produces a reversal + a new posting (3 ledger rows), never mutates the original', async () => {
    const service = buildService({});
    const posted = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    if (posted.status !== 'posted') throw new Error('unreachable');
    const originalSnapshot = JSON.stringify(fakeCollection.docs[0]);

    const corrected = buildService({ record: makeSourceRecord({ amount: 950 }) });
    const outcome = await corrected.postSourceRecord(contextFor(null), 'user-2', SOURCE_ID);

    expect(outcome.status).toBe('corrected');
    if (outcome.status !== 'corrected') throw new Error('unreachable');
    expect(outcome.reversal.reversalOfPostingId).toBe(String(posted.posting._id));
    expect(outcome.reversal.amount).toBe(-837);
    expect(outcome.posting.amount).toBe(950);
    expect(outcome.posting.idempotencyKey).toMatch(/:v2$/);

    // 3 rows total: v1 original, its reversal, v2 corrected.
    expect(fakeCollection.docs).toHaveLength(3);

    // The ORIGINAL row is byte-identical to what it was before the
    // correction -- append-only means a correction is a new row, never
    // an edit.
    const originalNow = fakeCollection.docs.find((d: any) => String(d._id) === String(posted.posting._id));
    expect(JSON.stringify(originalNow)).toBe(originalSnapshot);
  });

  it('a same-amount recompute after a correction is again a no-op', async () => {
    const v1 = buildService({});
    const posted = await v1.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    if (posted.status !== 'posted') throw new Error('unreachable');

    const v2 = buildService({ record: makeSourceRecord({ amount: 950 }) });
    const corrected = await v2.postSourceRecord(contextFor(null), 'user-2', SOURCE_ID);
    if (corrected.status !== 'corrected') throw new Error('unreachable');

    const replay = buildService({ record: makeSourceRecord({ amount: 950 }) });
    const outcome = await replay.postSourceRecord(contextFor(null), 'user-3', SOURCE_ID);

    expect(outcome.status).toBe('unchanged');
    expect(fakeCollection.docs).toHaveLength(3);
  });

  it('refuses to correct a posting that a concurrent process already reversed (race guard)', async () => {
    // Seed an original + its reversal directly, bypassing the service,
    // to simulate the race window between reading "live" and acting on it.
    const { allocationLedgerRepository } = require('../../../modules/finance/repositories/allocation-ledger.repository');
    const orig = await allocationLedgerRepository.append(
      {
        orgUnitId: HARARE,
        vehicleId: VEHICLE_ID,
        costCategory: 'third-party-transport',
        allocationRule: 'direct',
        sourceCollection: 'tbltransportcostsourcerecords',
        sourceId: SOURCE_ID,
        periodStart: new Date('2026-01-05T00:00:00.000Z'),
        periodEnd: new Date('2026-01-05T00:00:00.000Z'),
        currency: 'USD',
        amount: 837,
        fxRate: 1,
        fxRateDate: new Date('2026-01-05T00:00:00.000Z'),
        fxSource: 'organization-default',
        reportingCurrency: 'USD',
        reportingAmount: 837,
        idempotencyKey: 'seed:v1',
        postedBy: 'seed-user',
        postedAt: new Date('2026-01-06T00:00:00.000Z'),
      },
      TENANT,
      'seed-user'
    );
    await allocationLedgerRepository.append(
      {
        orgUnitId: HARARE,
        vehicleId: VEHICLE_ID,
        costCategory: 'third-party-transport',
        allocationRule: 'direct',
        sourceCollection: 'tbltransportcostsourcerecords',
        sourceId: SOURCE_ID,
        periodStart: new Date('2026-01-05T00:00:00.000Z'),
        periodEnd: new Date('2026-01-05T00:00:00.000Z'),
        currency: 'USD',
        amount: -837,
        fxRate: 1,
        fxRateDate: new Date('2026-01-05T00:00:00.000Z'),
        fxSource: 'organization-default',
        reportingCurrency: 'USD',
        reportingAmount: -837,
        reversalOfPostingId: String(orig._id),
        reversalReason: 'seeded reversal for race-guard test',
        postedBy: 'seed-user',
        postedAt: new Date('2026-01-06T00:01:00.000Z'),
      },
      TENANT,
      'seed-user'
    );

    // `orig` is now a reversed "original" per findReversalOf, but it is
    // also the only row with no reversalOfPostingId of its own, so the
    // service's `originals` derivation still selects it as `live`.
    const service = buildService({ record: makeSourceRecord({ amount: 950 }) });
    await expect(service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID)).rejects.toBeInstanceOf(
      ConflictError
    );
  });
});

describe('TransportCostPostingService.postSourceRecord -- refused, never fabricated', () => {
  it('a null Amount is refused, never zero-filled', async () => {
    const service = buildService({ record: makeSourceRecord({ amount: null }) });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    expect(outcome).toEqual({
      status: 'skipped',
      reason: 'pending-amount',
      detail: expect.stringContaining('no Amount recorded'),
    });
    expect(fakeCollection.docs).toHaveLength(0);
  });

  it('a Vansales row with no TOTAL is refused, never zero-filled or derived from WEEK1-4', async () => {
    const service = buildService({
      record: makeSourceRecord({
        sheetFamily: 'vansales',
        date: null,
        amount: null,
        vansales: { payerName: 'Mr Gurjit', product: null, monthlyCostBeforeVat: null, weeklyAmounts: [null, null, null, null], total: null, periodMonth: '2026-01' },
      }),
    });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    expect(outcome).toEqual({
      status: 'skipped',
      reason: 'pending-amount',
      detail: expect.stringContaining('no TOTAL recorded'),
    });
    expect(fakeCollection.docs).toHaveLength(0);
  });

  it('a Vansales row with no periodMonth is refused, never inferred from a sheet-tab name', async () => {
    const service = buildService({
      record: makeSourceRecord({
        sheetFamily: 'vansales',
        date: null,
        amount: null,
        vansales: { payerName: 'Mr Gurjit', product: null, monthlyCostBeforeVat: null, weeklyAmounts: [null, null, null, null], total: 1200, periodMonth: null },
      }),
    });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    expect(outcome).toEqual({
      status: 'skipped',
      reason: 'missing-period-month',
      detail: expect.stringContaining('no valid periodMonth'),
    });
    expect(fakeCollection.docs).toHaveLength(0);
  });

  it('an unresolved vehicle identity (no confirmed ContractedVehicle yet) is refused', async () => {
    const service = buildService({ record: makeSourceRecord({ contractedVehicleId: undefined }) });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    expect(outcome.status).toBe('skipped');
    if (outcome.status !== 'skipped') throw new Error('unreachable');
    expect(outcome.reason).toBe('unresolved-vehicle-identity');
  });

  it('an unresolved currency is refused, never guessed', async () => {
    const service = buildService({ currency: '' });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    expect(outcome.status).toBe('skipped');
    if (outcome.status !== 'skipped') throw new Error('unreachable');
    expect(outcome.reason).toBe('unresolved-currency');
  });

  it('an unresolvable FX rate (foreign currency, no rate, no live feed) is refused, never assumed 1:1', async () => {
    const service = buildService({ currency: 'ZWL', reportingCurrency: 'USD' });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);
    expect(outcome.status).toBe('skipped');
    if (outcome.status !== 'skipped') throw new Error('unreachable');
    expect(outcome.reason).toBe('unresolved-fx-rate');
  });
});

describe('TransportCostPostingService.postSourceRecord -- Swift (posts under third-party-transport, always skips for vehicle identity)', () => {
  function makeSwiftRecord(overrides: Partial<TransportCostSourceRecord> = {}) {
    return makeSourceRecord({
      sheetFamily: 'swift',
      date: new Date(2026, 0, 5),
      rawDate: '2026-01-05',
      registration: null,
      registrationRaw: '',
      transporterNormalized: null,
      transporterRaw: '',
      destinationTown: 'Bulawayo',
      customerName: 'Olivine',
      salesInvoiceNo: 'CN-10234',
      amount: 4500,
      tonnageRaw: 32,
      // The structural fact this whole describe block exists to prove:
      // a real Swift row NEVER has a contractedVehicleId, because the
      // source has no registration/transporter column to resolve one
      // from -- see SWIFT_POSTING_DECISION.md.
      contractedVehicleId: undefined,
      ...overrides,
    });
  }

  it('resolves amount/date exactly like 3rd Party (amount <- Total(Incl), date <- Cons. date) -- proven via a Swift row WITH a vehicle override', async () => {
    // A real Swift row can never carry a contractedVehicleId (see below),
    // but resolveAmountAndPeriod's 'swift' case is exercised the same
    // way regardless -- this test isolates that resolution from the
    // (always-true, for real data) vehicle-identity skip, by overriding
    // contractedVehicleId as if a future change ever let one resolve.
    const service = buildService({ record: makeSwiftRecord({ contractedVehicleId: VEHICLE_ID }) });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(outcome.status).toBe('posted');
    if (outcome.status !== 'posted') throw new Error('unreachable');
    expect(outcome.posting.costCategory).toBe('third-party-transport');
    expect(outcome.posting.amount).toBe(4500);
    expect(outcome.posting.periodStart).toEqual(new Date(2026, 0, 5));
    expect(outcome.posting.periodEnd).toEqual(new Date(2026, 0, 5));
    expect(fakeCollection.docs).toHaveLength(1);
  });

  it('a real Swift row (no contractedVehicleId) always skips at unresolved-vehicle-identity, never fabricating a vehicle', async () => {
    const service = buildService({ record: makeSwiftRecord() });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(outcome).toEqual({
      status: 'skipped',
      reason: 'unresolved-vehicle-identity',
      detail: expect.any(String),
    });
    expect(fakeCollection.docs).toHaveLength(0);
  });

  it('a Swift row with no Total(Incl) is refused as pending-amount, never zero-filled (checked before the vehicle-identity skip would otherwise fire)', async () => {
    const service = buildService({ record: makeSwiftRecord({ amount: null, contractedVehicleId: undefined }) });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(outcome).toEqual({
      status: 'skipped',
      reason: 'pending-amount',
      detail: expect.stringContaining('no Amount recorded'),
    });
    expect(fakeCollection.docs).toHaveLength(0);
  });
});

describe('TransportCostPostingService.postSourceRecord -- Depot STO (posts under stock-transfer, DATE as-is, vehicle-identity resolvability depends on which month\'s shape the row came from)', () => {
  function makeDepotStoRecord(overrides: Partial<TransportCostSourceRecord> = {}) {
    return makeSourceRecord({
      sheetFamily: 'depot-sto',
      date: new Date(2026, 5, 15),
      rawDate: '15.06.26',
      registration: 'AGL8230',
      registrationRaw: 'AGL 8230',
      transporterNormalized: 'PRINORTH',
      transporterRaw: 'PRINORTH',
      amount: 4500,
      tonnageRaw: null,
      depotSto: {
        stoNumber: 'STO-1042',
        sourceLocation: 'Harare',
        depot: 'Bulawayo',
        commodity: 'Golden Glow 2L',
        driver: 'T. Moyo',
        toonnesRaw: 15,
        signOffMrGurjit: true,
        signOffMrInderjeet: false,
        signOffSharmaJi: true,
      },
      ...overrides,
    });
  }

  it('posts a June/July-shaped row (registration present, confirmed) under stock-transfer with DATE as-is for periodStart/periodEnd', async () => {
    const service = buildService({ record: makeDepotStoRecord({ contractedVehicleId: VEHICLE_ID }) });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(outcome.status).toBe('posted');
    if (outcome.status !== 'posted') throw new Error('unreachable');
    expect(outcome.posting.costCategory).toBe('stock-transfer');
    expect(outcome.posting.amount).toBe(4500);
    expect(outcome.posting.periodStart).toEqual(new Date(2026, 5, 15));
    expect(outcome.posting.periodEnd).toEqual(new Date(2026, 5, 15));
    expect(outcome.posting.description).toContain('STO-1042');
    expect(outcome.posting.description).toContain('Golden Glow 2L');
    expect(fakeCollection.docs).toHaveLength(1);
  });

  it('a row with no registration value (May\'s structurally-absent column, or June/July\'s present-but-empty one) skips at unresolved-vehicle-identity, never fabricating a vehicle', async () => {
    const service = buildService({
      record: makeDepotStoRecord({
        registration: null,
        registrationRaw: '',
        contractedVehicleId: undefined,
        depotSto: {
          stoNumber: 'STO-2001',
          sourceLocation: 'Harare',
          depot: 'Bulawayo',
          commodity: 'Puredrop 2L',
          driver: null,
          toonnesRaw: null,
          signOffMrGurjit: true,
          signOffMrInderjeet: true,
          signOffSharmaJi: false,
        },
      }),
    });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(outcome).toEqual({
      status: 'skipped',
      reason: 'unresolved-vehicle-identity',
      detail: expect.any(String),
    });
    expect(fakeCollection.docs).toHaveLength(0);
  });

  it('a March/April-shaped row (registration present but not yet confirmed to a ContractedVehicle) also skips at unresolved-vehicle-identity -- the ordinary Phase O2 gate, same as 3rd Party', async () => {
    const service = buildService({ record: makeDepotStoRecord({ contractedVehicleId: undefined }) });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(outcome.status).toBe('skipped');
    if (outcome.status !== 'skipped') throw new Error('unreachable');
    expect(outcome.reason).toBe('unresolved-vehicle-identity');
  });

  it('a Depot STO row with no Amount is refused as pending-amount, never zero-filled', async () => {
    const service = buildService({ record: makeDepotStoRecord({ amount: null, contractedVehicleId: VEHICLE_ID }) });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(outcome).toEqual({
      status: 'skipped',
      reason: 'pending-amount',
      detail: expect.stringContaining('no Amount recorded'),
    });
    expect(fakeCollection.docs).toHaveLength(0);
  });

  it('never surfaces the sign-off fields in the posting description -- raw provenance only, never treated as meaningful', async () => {
    const service = buildService({ record: makeDepotStoRecord({ contractedVehicleId: VEHICLE_ID }) });
    const outcome = await service.postSourceRecord(contextFor(null), 'user-1', SOURCE_ID);

    expect(outcome.status).toBe('posted');
    if (outcome.status !== 'posted') throw new Error('unreachable');
    expect(outcome.posting.description).not.toMatch(/gurjit|inderjeet|sharma/i);
  });
});

describe('TransportCostPostingService.postSourceRecord -- scoping', () => {
  it('404s (never a silent skip) for a source record outside the caller\'s org-unit scope', async () => {
    const service = buildService({});
    await expect(
      service.postSourceRecord(contextFor(['unit-bulawayo']), 'user-1', SOURCE_ID)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(fakeCollection.docs).toHaveLength(0);
  });

  it('404s for a source record id that does not exist', async () => {
    const service = buildService({ record: null });
    await expect(service.postSourceRecord(contextFor(null), 'user-1', 'nope')).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

describe('TransportCostPostingService.postImportBatch', () => {
  it('posts every record in a batch, best-effort, never aborting on one skip', async () => {
    const postable = makeSourceRecord({ _id: 'rec-a', amount: 500 });
    const pending = makeSourceRecord({ _id: 'rec-b', amount: null });
    const byId = new Map([
      ['rec-a', postable],
      ['rec-b', pending],
    ]);
    const service = new TransportCostPostingService(
      makeSourceRepo(null, {
        findByImportBatch: jest.fn().mockResolvedValue([postable, pending]),
        findById: jest.fn().mockImplementation(async (id: string) => byId.get(id) ?? null),
      }),
      makeVehicleRepo(makeVehicle()),
      makeVatConfigService('USD'),
      makeSettingsService('USD')
    );

    const result = await service.postImportBatch(contextFor(null), 'user-1', 'batch-1');

    expect(result.total).toBe(2);
    expect(result.outcomes.find((o) => o.sourceRecordId === 'rec-a')?.outcome.status).toBe('posted');
    expect(result.outcomes.find((o) => o.sourceRecordId === 'rec-b')?.outcome).toEqual({
      status: 'skipped',
      reason: 'pending-amount',
      detail: expect.any(String),
    });
  });
});
