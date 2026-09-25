// tests/unit/transport-cost/transport-cost-record-command.service.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. Exercises
// TransportCostRecordCommandService against REAL repositories backed by
// tests/helpers/fake-collection.ts -- the same "test through the actual
// logic, not a mock of it" discipline transport-cost-posting.service
// .spec.ts uses -- so the reversal/repost/idempotency behaviour proven
// here is the REAL AllocationService.reversePosting() and REAL
// TransportCostPostingService.postSourceRecord(), never a stand-in.
//
// Covers the gap-analysis doc's Section 8 financial invariants and
// CRUD/cancel/duplicate/security requirements:
//  - Edit: non-financial fields succeed on any non-cancelled record;
//    a financial-field edit on a POSTED record is refused (must use
//    Correct); an unknown field is refused; editing a cancelled record
//    is refused.
//  - Correct: financial-field edit on a POSTED record reverses the
//    original and reposts, net = the corrected total (worked example:
//    original +1000, corrected +1200 -> reversal -1000, new +1200, net
//    +1200, never +2200); the ORIGINAL posting is never mutated; Correct
//    on a non-posted record is refused (must use Edit).
//  - Cancel: pre-posting sets cancelledAt with no ledger row; cancelling
//    an already-cancelled record is refused; cancelling a POSTED record
//    reverses it (no repost) and the record derives as 'reversed', not
//    'cancelled'; a cancelled record can never be posted afterward.
//  - Duplicate: copies editable fields, never copies a confirmed
//    vehicle/transporter identity, never links to the original's
//    posting, and the ORIGINAL record is untouched.
//  - Security: cross-tenant and out-of-org-unit access both 404 (not a
//    silently empty/different result) on every mutation.

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
    __fakeLedger: collection,
  };
});

import { TransportCostSourceRecordRepository } from '../../../modules/transport-cost/repositories/transport-cost-source-record.repository';
import { NormalizationReviewRepository } from '../../../modules/transport-cost/repositories/normalization-review.repository';
import { TransportCostPostingService } from '../../../modules/transport-cost/services/transport-cost-posting.service';
import { TransportCostRecordCommandService } from '../../../modules/transport-cost/services/transport-cost-record-command.service';
import { allocationLedgerRepository } from '../../../modules/finance/repositories/allocation-ledger.repository';
import { allocationService } from '../../../modules/finance/services/allocation.service';
import { NotFoundError, ConflictError, ValidationError } from '../../../server/errors/app.errors';
import type { TransportCostSourceRecord } from '../../../shared/types/transport-cost.types';
import type { ContractedVehicle } from '../../../shared/types/contracted-vehicle.types';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';
import { FakeCollection } from '../../helpers/fake-collection';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __fakeLedger: fakeLedger } = require('../../../modules/finance/repositories/allocation-ledger.repository');

const TENANT = 'olivine-group-s5';
const HARARE = 'unit-harare';
const BULAWAYO = 'unit-bulawayo';
const VEHICLE_ID = 'contracted-vehicle-1';

function contextFor(accessibleOrgUnitIds: string[] | null, organizationId = TENANT): TenantContext {
  return {
    organizationId,
    organizationName: 'Olivine Group',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
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
    firstSeenSourceRecordId: 'seed',
    ...overrides,
  } as ContractedVehicle;
}

describe('TransportCostRecordCommandService', () => {
  let sourceFake: FakeCollection;
  let reviewFake: FakeCollection;
  let sourceRepo: TransportCostSourceRecordRepository;
  let reviewRepo: NormalizationReviewRepository;
  let postingService: TransportCostPostingService;
  let service: TransportCostRecordCommandService;

  beforeEach(() => {
    fakeLedger.docs = [];
    fakeLedger.seenFilters = [];
    jest.clearAllMocks();

    sourceFake = new FakeCollection();
    reviewFake = new FakeCollection();

    class TestSourceRepo extends TransportCostSourceRecordRepository {
      async getCollection() {
        return sourceFake as any;
      }
    }
    class TestReviewRepo extends NormalizationReviewRepository {
      async getCollection() {
        return reviewFake as any;
      }
    }

    sourceRepo = new TestSourceRepo();
    reviewRepo = new TestReviewRepo();

    const vehicleRepo = { findById: jest.fn().mockResolvedValue(makeVehicle()) } as any;
    const vatConfigService = {
      resolve: jest.fn().mockResolvedValue({ sheetFamily: 'third-party', currency: 'USD', vatBasis: 'unknown', isProvisionalDefault: true }),
    } as any;
    const settingsService = {
      resolve: jest.fn().mockResolvedValue({ reportingCurrency: 'USD', fxPolicy: 'transaction-date', glToleranceAmount: 0, usingDefaults: true }),
    } as any;

    postingService = new TransportCostPostingService(sourceRepo, vehicleRepo, vatConfigService, settingsService);
    service = new TransportCostRecordCommandService(sourceRepo, reviewRepo, allocationLedgerRepository, allocationService, postingService);
  });

  async function seedRecord(overrides: Partial<TransportCostSourceRecord> = {}): Promise<TransportCostSourceRecord> {
    return sourceRepo.create(
      {
        orgUnitId: HARARE,
        sheetFamily: 'third-party',
        importBatchId: 'batch-1',
        sourceFileName: 'JAN-26 3rd Party.xlsx',
        sourceRowNumber: 1,
        importedAt: new Date('2026-01-05'),
        rawRow: {},
        date: new Date('2026-01-05'),
        rawDate: '05.01.26',
        registration: 'AGL8230',
        registrationRaw: 'AGL 8230',
        transporterNormalized: 'SIGHTSCORE',
        transporterRaw: 'Sightscore',
        destinationTown: 'BULAWAYO',
        customerName: 'Acme Ltd',
        contractedVehicleId: VEHICLE_ID,
        costFacingCompany: 'olivine',
        amount: 1000,
        tonnageRaw: 1200,
        ...overrides,
      } as any,
      TENANT,
      'user-1'
    );
  }

  describe('Edit', () => {
    it('applies a non-financial edit to a ready-to-post record', async () => {
      const record = await seedRecord();
      const updated = await service.editSourceRecord(contextFor(null), 'user-2', record._id!, {
        customerName: 'New Customer',
      });
      expect(updated.customerName).toBe('New Customer');
    });

    it('refuses an edit touching a financial field on a POSTED record, pointing at Correct', async () => {
      const record = await seedRecord();
      await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);

      await expect(
        service.editSourceRecord(contextFor(null), 'user-2', record._id!, { amount: 2000 })
      ).rejects.toThrow(/Correct action/);
    });

    it('allows a non-financial edit on a POSTED record with no ledger consequence', async () => {
      const record = await seedRecord();
      await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);
      const before = fakeLedger.docs.length;

      const updated = await service.editSourceRecord(contextFor(null), 'user-2', record._id!, {
        customerName: 'Renamed Customer',
      });
      expect(updated.customerName).toBe('Renamed Customer');
      expect(fakeLedger.docs.length).toBe(before); // no new ledger row
    });

    it('rejects an unknown/non-editable field', async () => {
      const record = await seedRecord();
      await expect(
        service.editSourceRecord(contextFor(null), 'user-2', record._id!, { importBatchId: 'hacked' } as any)
      ).rejects.toThrow(ValidationError);
    });

    it('refuses to edit a cancelled record', async () => {
      const record = await seedRecord();
      await service.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'mistake');
      await expect(
        service.editSourceRecord(contextFor(null), 'user-2', record._id!, { customerName: 'X' })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('Correct (financial invariant: reversal + replacement, net = corrected total)', () => {
    it('worked example: original +1000, corrected to +1200 -> reversal -1000, new +1200, net +1200 (never +2200)', async () => {
      const record = await seedRecord({ amount: 1000 });
      const firstPost = await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);
      expect(firstPost.status).toBe('posted');

      const { outcome } = await service.correctPostedSourceRecord(contextFor(null), 'user-2', record._id!, {
        amount: 1200,
      });
      expect(outcome.status).toBe('corrected');
      if (outcome.status !== 'corrected') throw new Error('unreachable');

      expect(outcome.reversal.amount).toBe(-1000);
      expect(outcome.posting.amount).toBe(1200);

      const net = fakeLedger.docs.reduce((sum: number, d: any) => sum + d.amount, 0);
      expect(net).toBe(1200); // NOT 2200 -- the original is never double-counted
      expect(fakeLedger.docs).toHaveLength(3); // original + reversal + new posting
    });

    it('the ORIGINAL posting is never mutated by a correction', async () => {
      const record = await seedRecord({ amount: 1000 });
      const firstPost = await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);
      if (firstPost.status !== 'posted') throw new Error('unreachable');
      const originalSnapshot = { ...firstPost.posting };

      await service.correctPostedSourceRecord(contextFor(null), 'user-2', record._id!, { amount: 1200 });

      const originalStillInLedger = fakeLedger.docs.find((d: any) => d._id === originalSnapshot._id);
      expect(originalStillInLedger.amount).toBe(originalSnapshot.amount);
      expect(originalStillInLedger.currency).toBe(originalSnapshot.currency);
    });

    it('refuses Correct on a record that has never been posted -- must use Edit instead', async () => {
      const record = await seedRecord();
      await expect(
        service.correctPostedSourceRecord(contextFor(null), 'user-2', record._id!, { amount: 500 })
      ).rejects.toThrow(/use Edit instead/);
    });
  });

  describe('Cancel', () => {
    it('pre-posting cancel sets cancelledAt/cancelledBy/cancelReason with no ledger row', async () => {
      const record = await seedRecord();
      const cancelled = await service.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'duplicate entry');
      expect(cancelled.cancelledAt).toBeTruthy();
      expect(cancelled.cancelledBy).toBe('user-1');
      expect(cancelled.cancelReason).toBe('duplicate entry');
      expect(fakeLedger.docs).toHaveLength(0);
    });

    it('refuses to cancel an already-cancelled record', async () => {
      const record = await seedRecord();
      await service.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'first reason');
      await expect(
        service.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'second reason')
      ).rejects.toThrow(ConflictError);
    });

    it('cancelling a POSTED record reverses it (no repost); the record derives as reversed, not cancelled', async () => {
      const record = await seedRecord({ amount: 1000 });
      await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);

      await service.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'wrong record entirely');

      expect(fakeLedger.docs).toHaveLength(2); // original + reversal, no repost
      const net = fakeLedger.docs.reduce((sum: number, d: any) => sum + d.amount, 0);
      expect(net).toBe(0);

      const status = await service.getOperationalStatus(contextFor(null), record._id!);
      expect(status.status).toBe('reversed');
    });

    it('a cancelled record can never be posted afterward', async () => {
      const record = await seedRecord();
      await service.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'never happened');

      const outcome = await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);
      expect(outcome.status).toBe('skipped');
      if (outcome.status !== 'skipped') throw new Error('unreachable');
      expect(outcome.reason).toBe('cancelled-record');
      expect(fakeLedger.docs).toHaveLength(0);
    });

    it('requires a non-empty reason', async () => {
      const record = await seedRecord();
      await expect(service.cancelSourceRecord(contextFor(null), 'user-1', record._id!, '   ')).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('Duplicate', () => {
    it('copies editable fields but never a confirmed identity, never links to a posting, and leaves the original untouched', async () => {
      const record = await seedRecord({ amount: 1000, customerName: 'Acme Ltd' });
      await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);

      const duplicate = await service.duplicateSourceRecord(contextFor(null), 'user-2', record._id!);

      expect(duplicate._id).not.toBe(record._id);
      expect(duplicate.amount).toBe(1000);
      expect(duplicate.customerName).toBe('Acme Ltd');
      expect(duplicate.duplicatedFromId).toBe(record._id);
      expect(duplicate.contractedVehicleId).toBeUndefined();
      expect(duplicate.transporterPartnerId).toBeUndefined();
      expect(duplicate.cancelledAt).toBeUndefined();

      const duplicateStatus = await service.getOperationalStatus(contextFor(null), duplicate._id!);
      expect(duplicateStatus.status).toBe('ready-to-post'); // raw transporter still resolves without O2 in this fixture's vehicle repo mock, but no posting exists yet
      expect(duplicateStatus.postingHistory).toHaveLength(0);

      const originalUnchanged = await sourceRepo.findById(record._id!, TENANT);
      expect(originalUnchanged?.amount).toBe(1000);
      expect(originalUnchanged?.contractedVehicleId).toBe(VEHICLE_ID); // original's own identity is untouched
    });

    it('duplicating a CANCELLED record still works -- the copy starts fresh, uncancelled', async () => {
      const record = await seedRecord({ amount: 400 });
      await service.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'wrong invoice attached');

      const duplicate = await service.duplicateSourceRecord(contextFor(null), 'user-2', record._id!);
      expect(duplicate.cancelledAt).toBeUndefined();
      expect(duplicate.cancelReason).toBeUndefined();

      const duplicateStatus = await service.getOperationalStatus(contextFor(null), duplicate._id!);
      expect(duplicateStatus.status).toBe('ready-to-post');
    });

    it('duplicating a REVERSED record still works -- the copy has no posting history of its own', async () => {
      const record = await seedRecord({ amount: 800 });
      await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);
      await service.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'duplicate invoice');
      const originalStatus = await service.getOperationalStatus(contextFor(null), record._id!);
      expect(originalStatus.status).toBe('reversed');

      const duplicate = await service.duplicateSourceRecord(contextFor(null), 'user-2', record._id!);
      const duplicateStatus = await service.getOperationalStatus(contextFor(null), duplicate._id!);
      expect(duplicateStatus.status).toBe('ready-to-post');
      expect(duplicateStatus.postingHistory).toHaveLength(0);
    });
  });

  describe('Edit on a REVERSED record (never posted OR reversed both take the same "any field editable" path)', () => {
    it('allows a financial-field edit on a reversed record -- it has no LIVE posting to protect', async () => {
      const record = await seedRecord({ amount: 500 });
      await postingService.postSourceRecord(contextFor(null), 'user-1', record._id!);
      await service.cancelSourceRecord(contextFor(null), 'user-1', record._id!, 'billed to wrong customer');
      const status = await service.getOperationalStatus(contextFor(null), record._id!);
      expect(status.status).toBe('reversed');

      const updated = await service.editSourceRecord(contextFor(null), 'user-2', record._id!, { amount: 999 });
      expect(updated.amount).toBe(999);
    });
  });

  describe('Concurrency: conditionalUpdate guard failure (repository-level, isolated from the pre-check every service method also does)', () => {
    it('an update whose guard fails (record cancelled between read and write) reports guard-failed and touches nothing', async () => {
      const record = await seedRecord({ amount: 300 });

      // Simulate the actual race window: something else cancels the
      // record via a DIFFERENT path than conditionalUpdate itself
      // (bulkSetField's own $set), so this write's guard --
      // `cancelledAt: {$exists: false}` -- is evaluated against a
      // document that changed underneath it, exactly as two concurrent
      // HTTP requests racing between their own read and write would.
      const collection = await sourceRepo.getCollection();
      await collection.updateOne(
        { _id: record._id },
        { $set: { cancelledAt: new Date(), cancelledBy: 'someone-else', cancelReason: 'raced in first' } }
      );

      const result = await sourceRepo.conditionalUpdate(
        record._id!,
        { cancelledAt: { $exists: false } } as any,
        { customerName: 'Should never land' },
        contextFor(null),
        'user-2'
      );
      expect(result.outcome).toBe('guard-failed');

      const finalRecord = await sourceRepo.findById(record._id!, TENANT);
      expect(finalRecord?.customerName).not.toBe('Should never land'); // the losing write never applied
      expect(finalRecord?.cancelReason).toBe('raced in first'); // the winner's state is untouched
    });
  });

  describe('Bulk status (operational table column) -- getOperationalStatusesForIds', () => {
    it('returns the correct status per record for a mixed page, in a FIXED number of queries (no N+1)', async () => {
      const needsReview = await seedRecord({ sourceRowNumber: 1 });
      const readyToPost = await seedRecord({ sourceRowNumber: 2, transporterNormalized: undefined, transporterRaw: undefined });
      const posted = await seedRecord({ sourceRowNumber: 3, amount: 500 });
      await postingService.postSourceRecord(contextFor(null), 'user-1', posted._id!);

      await reviewRepo.create(
        { kind: 'transporter', rawValue: 'Sightscore', status: 'pending', sourceRecordIds: [needsReview._id!] } as any,
        TENANT,
        'user-1'
      );

      const reviewSpy = jest.spyOn(reviewRepo, 'findPendingForSourceRecordIds');
      const ledgerSpy = jest.spyOn(allocationLedgerRepository, 'findBySourceIdsForCategory');

      const statuses = await service.getOperationalStatusesForIds(contextFor(null), [
        needsReview._id!,
        readyToPost._id!,
        posted._id!,
      ]);

      expect(statuses[needsReview._id!]).toBe('needs-review');
      expect(statuses[readyToPost._id!]).toBe('ready-to-post');
      expect(statuses[posted._id!]).toBe('posted');

      // ONE bulk call each, regardless of the 3 records on this page --
      // the whole point of the bulk path (see the service method's own
      // header): a naive per-row implementation would call these 3 times.
      expect(reviewSpy).toHaveBeenCalledTimes(1);
      expect(ledgerSpy).toHaveBeenCalledTimes(1);
    });

    it('silently omits an out-of-scope id rather than leaking its status', async () => {
      const inScope = await seedRecord({ orgUnitId: HARARE });
      const outOfScope = await seedRecord({ orgUnitId: BULAWAYO });

      const statuses = await service.getOperationalStatusesForIds(contextFor([HARARE]), [
        inScope._id!,
        outOfScope._id!,
      ]);

      expect(statuses[inScope._id!]).toBe('ready-to-post');
      expect(Object.prototype.hasOwnProperty.call(statuses, outOfScope._id!)).toBe(false);
    });

    it('returns an empty object for an empty id list without querying anything', async () => {
      const reviewSpy = jest.spyOn(reviewRepo, 'findPendingForSourceRecordIds');
      const statuses = await service.getOperationalStatusesForIds(contextFor(null), []);
      expect(statuses).toEqual({});
      expect(reviewSpy).not.toHaveBeenCalled();
    });
  });

  describe('Security: tenant and org-unit isolation', () => {
    it('a record in a different org unit 404s for a scoped caller (Edit)', async () => {
      const record = await seedRecord({ orgUnitId: BULAWAYO });
      await expect(
        service.editSourceRecord(contextFor([HARARE]), 'user-2', record._id!, { customerName: 'X' })
      ).rejects.toThrow(NotFoundError);
    });

    it('a record in a different tenant 404s (Cancel)', async () => {
      const record = await seedRecord();
      await expect(
        service.cancelSourceRecord(contextFor(null, 'attacker-org'), 'user-2', record._id!, 'x')
      ).rejects.toThrow(NotFoundError);
    });

    it('a record in a different tenant 404s (Duplicate)', async () => {
      const record = await seedRecord();
      await expect(
        service.duplicateSourceRecord(contextFor(null, 'attacker-org'), 'user-2', record._id!)
      ).rejects.toThrow(NotFoundError);
    });

    it('an empty accessible-org-unit scope fails closed (sees nothing, not everything)', async () => {
      const record = await seedRecord({ orgUnitId: HARARE });
      await expect(
        service.editSourceRecord(contextFor([]), 'user-2', record._id!, { customerName: 'X' })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
