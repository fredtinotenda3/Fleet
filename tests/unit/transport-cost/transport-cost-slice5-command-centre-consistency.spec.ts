// tests/unit/transport-cost/transport-cost-slice5-command-centre-consistency.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5, task #62: "Command Centre
// consistency verification after mutations." Every earlier Slice 5 test
// (transport-cost-record-command.service.spec.ts) proves the Allocation
// Ledger itself nets correctly after a Correct/Cancel. This file proves
// the SEPARATE, ALREADY-EXISTING read path a human actually looks at --
// TransportCostReportService.getCommandCentreSummary (Slice 4) -- agrees
// with that ledger state immediately afterward, through the exact same
// aggregation every other Command Centre test exercises. No new
// architecture, no new cache, no new summary field: this is a
// consistency check between two things that already existed before this
// slice, wired together for the first time.
//
// Same triple-mock pattern as transport-cost-command-centre.service.spec
// .ts (ledger + source-record repositories backed by tests/helpers/
// fake-collection.ts, so both TransportCostRecordCommandService's writes
// and TransportCostReportService's reads hit the SAME in-memory store),
// plus TransportCostPostingService/TransportCostRecordCommandService
// wired the same way transport-cost-record-command.service.spec.ts wires
// them.

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

jest.mock('@/infrastructure/monitoring/audit.logger', () => ({
  auditLog: { log: jest.fn(), logCreate: jest.fn(), logAction: jest.fn(), logUpdate: jest.fn() },
}));

import { TransportCostReportService } from '../../../modules/transport-cost/services/transport-cost-report.service';
import { TransportCostPostingService } from '../../../modules/transport-cost/services/transport-cost-posting.service';
import { TransportCostRecordCommandService } from '../../../modules/transport-cost/services/transport-cost-record-command.service';
import { NormalizationReviewRepository } from '../../../modules/transport-cost/repositories/normalization-review.repository';
import { FakeCollection } from '../../helpers/fake-collection';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { allocationLedgerRepository, __fakeCollection: fakeLedger } = require('../../../modules/finance/repositories/allocation-ledger.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transportCostSourceRecordRepository, __fakeCollection: fakeSource } = require('../../../modules/transport-cost/repositories/transport-cost-source-record.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transportCostImportExceptionRepository } = require('../../../modules/transport-cost/repositories/transport-cost-import-exception.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { allocationService } = require('../../../modules/finance/services/allocation.service');

const TENANT = 'olivine-group-s5-cc';
const HARARE = 'unit-harare';
const VEHICLE_ID = 'veh-1';
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

function makeVehicleRepo() {
  const vehicle = { _id: VEHICLE_ID, registration: 'AGL8230', transporterPartnerId: 'p-1', businessStream: 'olivine' };
  return {
    findAllConfirmed: jest.fn().mockResolvedValue([vehicle]),
    findById: jest.fn().mockResolvedValue(vehicle),
    findByTransporterPartnerId: jest.fn().mockResolvedValue([vehicle]),
  } as any;
}

function makePartnerRepo() {
  return { findById: jest.fn().mockResolvedValue({ _id: 'p-1', canonicalName: 'SIGHTSCORE' }) } as any;
}

function makeSettingsService() {
  return {
    resolve: jest.fn().mockResolvedValue({ reportingCurrency: 'USD', fxPolicy: 'transaction-date', glToleranceAmount: 0, usingDefaults: true }),
  } as any;
}

function makeVatConfigService() {
  return {
    resolve: jest.fn().mockResolvedValue({ sheetFamily: 'third-party', currency: 'USD', vatBasis: 'unknown', isProvisionalDefault: true }),
  } as any;
}

describe('Slice 5 <-> Command Centre consistency (task #62)', () => {
  let reviewFake: FakeCollection;
  let reportService: TransportCostReportService;
  let postingService: TransportCostPostingService;
  let commandService: TransportCostRecordCommandService;

  beforeEach(() => {
    fakeLedger.docs = [];
    fakeLedger.seenFilters = [];
    fakeSource.docs = [];
    fakeSource.seenFilters = [];
    jest.clearAllMocks();

    reviewFake = new FakeCollection();
    class TestReviewRepo extends NormalizationReviewRepository {
      async getCollection() {
        return reviewFake as any;
      }
    }
    const reviewRepo = new TestReviewRepo();

    reportService = new TransportCostReportService(
      makeVehicleRepo(),
      makePartnerRepo(),
      makeSettingsService(),
      allocationLedgerRepository,
      transportCostSourceRecordRepository,
      transportCostImportExceptionRepository
    );

    postingService = new TransportCostPostingService(
      transportCostSourceRecordRepository,
      makeVehicleRepo(),
      makeVatConfigService(),
      makeSettingsService()
    );

    commandService = new TransportCostRecordCommandService(
      transportCostSourceRecordRepository,
      reviewRepo,
      allocationLedgerRepository,
      allocationService,
      postingService
    );
  });

  async function seedRecord(amount: number) {
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
        contractedVehicleId: VEHICLE_ID,
        costFacingCompany: 'olivine',
        amount,
        tonnageRaw: null,
      },
      TENANT,
      'user-1'
    );
  }

  it('a fresh posting appears in the Command Centre net total immediately', async () => {
    const record = await seedRecord(1000);
    await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);

    const summary = await reportService.getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(summary.totals).toEqual([
      { key: 'total', label: 'Total', reportingCurrency: 'USD', netReportingAmount: 1000, postingCount: 1 },
    ]);
  });

  it('a Correct (reverse + repost) shows the CORRECTED total in the Command Centre, never the sum of both', async () => {
    const record = await seedRecord(1000);
    await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);

    const before = await reportService.getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(before.totals[0].netReportingAmount).toBe(1000);

    await commandService.correctPostedSourceRecord(contextFor(null), 'user-2', record._id!, { amount: 1750 });

    const after = await reportService.getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    expect(after.totals).toEqual([
      { key: 'total', label: 'Total', reportingCurrency: 'USD', netReportingAmount: 1750, postingCount: 3 },
    ]);
    // 3 raw postings (original + reversal + new), net 1750 -- matches the
    // exact worked-example invariant transport-cost-record-command
    // .service.spec.ts pins at the ledger layer; this proves the SAME
    // fact is visible through the Command Centre's own aggregation.
  });

  it('cancelling a POSTED record nets its ledger contribution to zero in the Command Centre -- both the reversal and the original stay visible, never silently dropped', async () => {
    const record = await seedRecord(1000);
    await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);
    await commandService.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'wrong record entirely');

    const summary = await reportService.getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    // Original (+1000) and reversal (-1000) both remain real postings in
    // scope -- postingCount: 2 -- netting to a real $0, which the
    // aggregation reports as an explicit zero-amount total (not an empty
    // "no data" array): a genuine "$0 net across 2 postings" is a
    // different, more informative fact than "nothing happened here at
    // all", and getCommandCentreSummary only omits the 'total' bucket
    // when there are truly zero postings in scope (see the pre-posting
    // Cancel case below).
    expect(summary.totals).toEqual([
      { key: 'total', label: 'Total', reportingCurrency: 'USD', netReportingAmount: 0, postingCount: 2 },
    ]);
  });

  it('a pre-posting Cancel never appears in the Command Centre\'s FINANCIAL totals (it was never posted), but still counts as an operation that occurred', async () => {
    const record = await seedRecord(1000);
    await commandService.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'entered by mistake');

    const summary = await reportService.getCommandCentreSummary(contextFor(null), JAN_START, JAN_END, 'month');
    // No posting was ever created, so the FINANCIAL total is genuinely
    // empty ("no data"), not a fabricated $0 row -- unlike the
    // posted-then-cancelled case above, there is no posting at all here.
    expect(summary.totals).toEqual([]);
    // The OPERATIONAL count is a deliberately separate, source-record-
    // level metric (see getCommandCentreSummary's own "operational
    // metrics -- SOURCE RECORDS only, never the ledger" comment) -- a
    // cancelled-before-posting record still occurred as an operation
    // (it exists, it was imported, someone then cancelled it), so it
    // correctly still counts here even though it contributed nothing
    // financial. Financial and operational are two different questions;
    // this is not an inconsistency.
    expect(summary.operational.totalOperations).toBe(1);
  });
});
