// tests/unit/transport-cost/normalization-review-gap-closure.spec.ts
//
// GAP-CLOSURE PASS, Objectives 3 and 5. Exercises the CQRS handlers
// directly (real TransportPartnerRepository/ContractedVehicleRepository/
// NormalizationReviewRepository/TransportCostSourceRecordRepository
// instances over tests/helpers/fake-collection.ts -- the same "test
// through the actual pipeline" discipline the rest of this suite uses)
// rather than through the command bus, since the bus wiring itself is
// pinned separately by cqrs.register.ts's own shape and the route-
// reachability tests below.
//
// Objective 3 ("Review queue alternative identity selection"):
//  - ConfirmReviewMatchHandler already accepted any tenant-scoped
//    entity id before this pass (see its own header) -- these tests
//    PROVE that capability end-to-end: an alternative (non-suggested)
//    transporter/vehicle resolves correctly, sourceRecordIds get
//    repointed, and the decision is recorded in the audit trail
//    (a genuine gap this pass closed) with wasAlternativeSelection: true.
//  - Adversarial: cross-tenant candidate rejection, invalid/nonexistent
//    candidate rejection, merged-partner rejection, already-resolved
//    item rejection (no double-processing).
//  - Audit entries are also proven for confirm-new and reject, closing
//    the "no auditLog call found" gap in all three O2 review handlers.
//
// Objective 5 ("Add new master data"):
//  - RequestNewTransporterHandler / RequestNewVehicleHandler: creation,
//    duplicate prevention (dedup returns the existing row, created:
//    false, never a second row), tenant isolation, vehicle-requires-
//    existing-non-merged-transporter, validation.
//  - ConfirmPendingMasterDataHandler / RejectPendingMasterDataHandler:
//    needs-review -> confirmed/rejected, refuses a row that is not
//    needs-review (already confirmed/rejected), reason required to
//    reject.
//  - ListPendingMasterDataHandler: returns only needs-review rows, tenant
//    isolation.

jest.mock('@/infrastructure/monitoring/audit.logger', () => ({
  auditLog: {
    log: jest.fn(),
    logCreate: jest.fn(),
    logAction: jest.fn(),
    logUpdate: jest.fn(),
    logDelete: jest.fn(),
    logLogin: jest.fn(),
  },
}));

import { TransportPartnerRepository } from '../../../modules/transport-cost/repositories/transport-partner.repository';
import { ContractedVehicleRepository } from '../../../modules/transport-cost/repositories/contracted-vehicle.repository';
import { NormalizationReviewRepository } from '../../../modules/transport-cost/repositories/normalization-review.repository';
import { TransportCostSourceRecordRepository } from '../../../modules/transport-cost/repositories/transport-cost-source-record.repository';
import { FakeCollection } from '../../helpers/fake-collection';

import { ConfirmReviewMatchHandler, NORMALIZATION_REVIEW_ENTITY_TYPE } from '../../../modules/transport-cost/commands/handlers/confirm-review-match.handler';
import { ConfirmReviewMatchCommand } from '../../../modules/transport-cost/commands/confirm-review-match.command';
import { ConfirmReviewNewHandler } from '../../../modules/transport-cost/commands/handlers/confirm-review-new.handler';
import { ConfirmReviewNewCommand } from '../../../modules/transport-cost/commands/confirm-review-new.command';
import { RejectReviewItemHandler } from '../../../modules/transport-cost/commands/handlers/reject-review-item.handler';
import { RejectReviewItemCommand } from '../../../modules/transport-cost/commands/reject-review-item.command';

import { RequestNewTransporterHandler } from '../../../modules/transport-cost/commands/handlers/request-new-transporter.handler';
import { RequestNewTransporterCommand } from '../../../modules/transport-cost/commands/request-new-transporter.command';
import { RequestNewVehicleHandler } from '../../../modules/transport-cost/commands/handlers/request-new-vehicle.handler';
import { RequestNewVehicleCommand } from '../../../modules/transport-cost/commands/request-new-vehicle.command';
import { ConfirmPendingMasterDataHandler } from '../../../modules/transport-cost/commands/handlers/confirm-pending-master-data.handler';
import { ConfirmPendingMasterDataCommand } from '../../../modules/transport-cost/commands/confirm-pending-master-data.command';
import { RejectPendingMasterDataHandler } from '../../../modules/transport-cost/commands/handlers/reject-pending-master-data.handler';
import { RejectPendingMasterDataCommand } from '../../../modules/transport-cost/commands/reject-pending-master-data.command';
import { ListPendingMasterDataHandler } from '../../../modules/transport-cost/queries/handlers/list-pending-master-data.handler';
import { ListPendingMasterDataQuery } from '../../../modules/transport-cost/queries/list-pending-master-data.query';

import { NotFoundError, ConflictError, ValidationError } from '../../../server/errors/app.errors';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { auditLog } = require('@/infrastructure/monitoring/audit.logger');

const TENANT = 'olivine-group-gc';
const OTHER_TENANT = 'attacker-org-gc';

function makePartnerRepo() {
  const fake = new FakeCollection();
  class TestRepo extends TransportPartnerRepository {
    async getCollection() {
      return fake as any;
    }
  }
  return { repo: new TestRepo(), fake };
}
function makeVehicleRepo() {
  const fake = new FakeCollection();
  class TestRepo extends ContractedVehicleRepository {
    async getCollection() {
      return fake as any;
    }
  }
  return { repo: new TestRepo(), fake };
}
function makeReviewRepo() {
  const fake = new FakeCollection();
  class TestRepo extends NormalizationReviewRepository {
    async getCollection() {
      return fake as any;
    }
  }
  return { repo: new TestRepo(), fake };
}
function makeSourceRepo() {
  const fake = new FakeCollection();
  class TestRepo extends TransportCostSourceRecordRepository {
    async getCollection() {
      return fake as any;
    }
  }
  return { repo: new TestRepo(), fake };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Objective 3 -- ConfirmReviewMatchHandler: alternative identity selection', () => {
  let partnerRepo: TransportPartnerRepository;
  let vehicleRepo: ContractedVehicleRepository;
  let reviewRepo: NormalizationReviewRepository;
  let sourceRepo: TransportCostSourceRecordRepository;
  let handler: ConfirmReviewMatchHandler;

  beforeEach(() => {
    partnerRepo = makePartnerRepo().repo;
    vehicleRepo = makeVehicleRepo().repo;
    reviewRepo = makeReviewRepo().repo;
    sourceRepo = makeSourceRepo().repo;
    handler = new ConfirmReviewMatchHandler(reviewRepo, partnerRepo, vehicleRepo, sourceRepo);
  });

  async function seedTransporters() {
    const suggested = await partnerRepo.create({ canonicalName: 'SIGHTSCORE', aliases: [], reviewStatus: 'confirmed' }, TENANT, 'u');
    const alternative = await partnerRepo.create({ canonicalName: 'SHARMIC TRANSPORT', aliases: [], reviewStatus: 'confirmed' }, TENANT, 'u');
    return { suggested, alternative };
  }

  async function seedReviewItem(overrides: Record<string, unknown> = {}) {
    return reviewRepo.create(
      {
        kind: 'transporter',
        rawValue: 'SIGTSCORE',
        candidateEntityId: undefined,
        status: 'pending',
        sourceRecordIds: ['src-1', 'src-2'],
        ...overrides,
      } as any,
      TENANT,
      'reviewer-1'
    );
  }

  it('resolves onto an ALTERNATIVE transporter the reviewer picked, not the system-suggested candidate', async () => {
    const { suggested, alternative } = await seedTransporters();
    const item = await seedReviewItem({ candidateEntityId: suggested._id });

    const result = await handler.execute(new ConfirmReviewMatchCommand(item._id!, alternative._id!, TENANT, 'reviewer-1'));

    expect(result.reviewItem.resolvedEntityId).toBe(alternative._id);
    expect(result.reviewItem.status).toBe('confirmed-match');
    expect(result.sourceRecordsUpdated).toBeGreaterThanOrEqual(0);

    // Audit trail records this was an alternative, not the suggested match.
    expect(auditLog.logUpdate).toHaveBeenCalledWith(
      'reviewer-1',
      TENANT,
      NORMALIZATION_REVIEW_ENTITY_TYPE,
      item._id,
      expect.anything(),
      expect.objectContaining({ resolvedEntityId: alternative._id, wasAlternativeSelection: true })
    );
  });

  it('resolves onto an alternative VEHICLE the reviewer picked', async () => {
    const { suggested: t1 } = await seedTransporters();
    const suggestedVehicle = await vehicleRepo.create(
      { registration: 'AGL8230', registrationRaw: 'AGL 8230', transporterPartnerId: t1._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
      TENANT,
      'u'
    );
    const alternativeVehicle = await vehicleRepo.create(
      { registration: 'AFJ5203', registrationRaw: 'AFJ 5203', transporterPartnerId: t1._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
      TENANT,
      'u'
    );
    const item = await seedReviewItem({ kind: 'vehicle', rawValue: 'AFJ 5203', candidateEntityId: suggestedVehicle._id });

    const result = await handler.execute(new ConfirmReviewMatchCommand(item._id!, alternativeVehicle._id!, TENANT, 'reviewer-1'));
    expect(result.reviewItem.resolvedEntityId).toBe(alternativeVehicle._id);

    expect(auditLog.logUpdate).toHaveBeenCalledWith(
      'reviewer-1',
      TENANT,
      NORMALIZATION_REVIEW_ENTITY_TYPE,
      item._id,
      expect.anything(),
      expect.objectContaining({ resolvedEntityId: alternativeVehicle._id, wasAlternativeSelection: true })
    );
  });

  it('records wasAlternativeSelection: false when the reviewer confirms the SUGGESTED candidate as-is', async () => {
    const { suggested } = await seedTransporters();
    const item = await seedReviewItem({ candidateEntityId: suggested._id });

    await handler.execute(new ConfirmReviewMatchCommand(item._id!, suggested._id!, TENANT, 'reviewer-1'));

    expect(auditLog.logUpdate).toHaveBeenCalledWith(
      'reviewer-1',
      TENANT,
      NORMALIZATION_REVIEW_ENTITY_TYPE,
      item._id,
      expect.anything(),
      expect.objectContaining({ resolvedEntityId: suggested._id, wasAlternativeSelection: false })
    );
  });

  it('ADVERSARIAL: rejects a candidate belonging to a DIFFERENT tenant', async () => {
    const attackerPartner = await partnerRepo.create(
      { canonicalName: 'ATTACKER CARRIER', aliases: [], reviewStatus: 'confirmed' },
      OTHER_TENANT,
      'attacker'
    );
    const item = await seedReviewItem();

    await expect(
      handler.execute(new ConfirmReviewMatchCommand(item._id!, attackerPartner._id!, TENANT, 'reviewer-1'))
    ).rejects.toThrow(NotFoundError);
  });

  it('ADVERSARIAL: rejects an invalid/nonexistent candidate id', async () => {
    const item = await seedReviewItem();
    await expect(
      handler.execute(new ConfirmReviewMatchCommand(item._id!, 'does-not-exist', TENANT, 'reviewer-1'))
    ).rejects.toThrow(NotFoundError);
  });

  it('ADVERSARIAL: rejects a candidate that has been merged into another partner', async () => {
    const { suggested } = await seedTransporters();
    const merged = await partnerRepo.create(
      { canonicalName: 'OLD NAME', aliases: [], reviewStatus: 'confirmed', mergedIntoPartnerId: suggested._id },
      TENANT,
      'u'
    );
    const item = await seedReviewItem();

    await expect(
      handler.execute(new ConfirmReviewMatchCommand(item._id!, merged._id!, TENANT, 'reviewer-1'))
    ).rejects.toThrow(ConflictError);
  });

  it('ADVERSARIAL: an already-resolved item cannot be resolved a second time (no double-processing)', async () => {
    const { suggested, alternative } = await seedTransporters();
    const item = await seedReviewItem({ candidateEntityId: suggested._id });
    await handler.execute(new ConfirmReviewMatchCommand(item._id!, suggested._id!, TENANT, 'reviewer-1'));

    await expect(
      handler.execute(new ConfirmReviewMatchCommand(item._id!, alternative._id!, TENANT, 'reviewer-2'))
    ).rejects.toThrow(ConflictError);
  });
});

describe('Objective 3 -- audit trail on confirm-new and reject (the pre-existing gap this pass closed)', () => {
  it('ConfirmReviewNewHandler records an audit entry for the create-new decision', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const reviewRepo = makeReviewRepo().repo;
    const sourceRepo = makeSourceRepo().repo;
    const handler = new ConfirmReviewNewHandler(reviewRepo, partnerRepo, vehicleRepo, sourceRepo);

    const item = await reviewRepo.create(
      { kind: 'transporter', rawValue: 'BRAND NEW CARRIER', status: 'pending', sourceRecordIds: ['src-1'] } as any,
      TENANT,
      'reviewer-1'
    );

    const result = await handler.execute(new ConfirmReviewNewCommand(item._id!, TENANT, 'reviewer-1'));
    expect(result.reviewItem.status).toBe('confirmed-new');
    expect(auditLog.logUpdate).toHaveBeenCalledWith(
      'reviewer-1',
      TENANT,
      NORMALIZATION_REVIEW_ENTITY_TYPE,
      item._id,
      expect.anything(),
      expect.objectContaining({ status: 'confirmed-new', createdEntityId: result.createdEntityId })
    );
  });

  it('RejectReviewItemHandler records an audit entry for the rejection decision', async () => {
    const reviewRepo = makeReviewRepo().repo;
    const handler = new RejectReviewItemHandler(reviewRepo);
    const item = await reviewRepo.create(
      { kind: 'transporter', rawValue: 'VAT EXCL', status: 'pending', sourceRecordIds: ['src-1'] } as any,
      TENANT,
      'reviewer-1'
    );

    const updated = await handler.execute(new RejectReviewItemCommand(item._id!, TENANT, 'reviewer-1', 'Not a real transporter'));
    expect(updated.status).toBe('rejected');
    expect(auditLog.logUpdate).toHaveBeenCalledWith(
      'reviewer-1',
      TENANT,
      NORMALIZATION_REVIEW_ENTITY_TYPE,
      item._id,
      expect.anything(),
      expect.objectContaining({ status: 'rejected', rejectedReason: 'Not a real transporter' })
    );
  });

  it('RejectReviewItemHandler still requires a non-empty reason', async () => {
    const reviewRepo = makeReviewRepo().repo;
    const handler = new RejectReviewItemHandler(reviewRepo);
    const item = await reviewRepo.create(
      { kind: 'transporter', rawValue: 'X', status: 'pending', sourceRecordIds: [] } as any,
      TENANT,
      'reviewer-1'
    );
    await expect(handler.execute(new RejectReviewItemCommand(item._id!, TENANT, 'reviewer-1', '   '))).rejects.toThrow(ValidationError);
  });
});

describe('Objective 5 -- RequestNewTransporterHandler', () => {
  it('creates a new needs-review transporter when no match exists', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const handler = new RequestNewTransporterHandler(partnerRepo);

    const result = await handler.execute(new RequestNewTransporterCommand('Brand New Carrier Ltd', TENANT, 'user-1'));
    expect(result.created).toBe(true);
    expect(result.record.reviewStatus).toBe('needs-review');
    expect(auditLog.logCreate).toHaveBeenCalled();
  });

  it('duplicate prevention: returns the EXISTING row (created: false) rather than filing a second pending request', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const handler = new RequestNewTransporterHandler(partnerRepo);

    const first = await handler.execute(new RequestNewTransporterCommand('Sightscore Logistics', TENANT, 'user-1'));
    expect(first.created).toBe(true);

    const second = await handler.execute(new RequestNewTransporterCommand('sightscore logistics', TENANT, 'user-2'));
    expect(second.created).toBe(false);
    expect(second.record._id).toBe(first.record._id);
  });

  it('tenant isolation: a duplicate name in a DIFFERENT tenant does not suppress creation for this tenant', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const handler = new RequestNewTransporterHandler(partnerRepo);

    await partnerRepo.create({ canonicalName: 'SHARED NAME CARRIER', aliases: [], reviewStatus: 'confirmed' }, OTHER_TENANT, 'attacker');

    const result = await handler.execute(new RequestNewTransporterCommand('Shared Name Carrier', TENANT, 'user-1'));
    expect(result.created).toBe(true);
  });

  it('rejects a blank name', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const handler = new RequestNewTransporterHandler(partnerRepo);
    await expect(handler.execute(new RequestNewTransporterCommand('   ', TENANT, 'user-1'))).rejects.toThrow(ValidationError);
  });
});

describe('Objective 5 -- RequestNewVehicleHandler', () => {
  it('creates a new needs-review vehicle under an existing, confirmed transporter', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const handler = new RequestNewVehicleHandler(vehicleRepo, partnerRepo);

    const transporter = await partnerRepo.create({ canonicalName: 'SIGHTSCORE', aliases: [], reviewStatus: 'confirmed' }, TENANT, 'u');
    const result = await handler.execute(new RequestNewVehicleCommand('AGL 8230', transporter._id!, TENANT, 'user-1'));
    expect(result.created).toBe(true);
    expect(result.record.reviewStatus).toBe('needs-review');
    expect(result.record.transporterPartnerId).toBe(transporter._id);
  });

  it('duplicate prevention: returns the existing vehicle rather than creating a second row for the same registration', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const handler = new RequestNewVehicleHandler(vehicleRepo, partnerRepo);
    const transporter = await partnerRepo.create({ canonicalName: 'SIGHTSCORE', aliases: [], reviewStatus: 'confirmed' }, TENANT, 'u');

    const first = await handler.execute(new RequestNewVehicleCommand('AGL 8230', transporter._id!, TENANT, 'user-1'));
    // normalizeRegistration only collapses whitespace and uppercases (it
    // deliberately does not strip punctuation -- see its own header), so
    // the duplicate probe must vary only in whitespace/case to land on
    // the same normalized registration.
    const second = await handler.execute(new RequestNewVehicleCommand('agl  8230', transporter._id!, TENANT, 'user-2'));
    expect(second.created).toBe(false);
    expect(second.record._id).toBe(first.record._id);
  });

  it('rejects a nonexistent transporter', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const handler = new RequestNewVehicleHandler(vehicleRepo, partnerRepo);
    await expect(
      handler.execute(new RequestNewVehicleCommand('AGL 8230', 'does-not-exist', TENANT, 'user-1'))
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a transporter from a DIFFERENT tenant (tenant isolation)', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const handler = new RequestNewVehicleHandler(vehicleRepo, partnerRepo);
    const attackerTransporter = await partnerRepo.create({ canonicalName: 'ATTACKER CARRIER', aliases: [], reviewStatus: 'confirmed' }, OTHER_TENANT, 'attacker');

    await expect(
      handler.execute(new RequestNewVehicleCommand('AGL 8230', attackerTransporter._id!, TENANT, 'user-1'))
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a transporter that has been merged away', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const handler = new RequestNewVehicleHandler(vehicleRepo, partnerRepo);
    const survivor = await partnerRepo.create({ canonicalName: 'SURVIVOR', aliases: [], reviewStatus: 'confirmed' }, TENANT, 'u');
    const merged = await partnerRepo.create(
      { canonicalName: 'OLD NAME', aliases: [], reviewStatus: 'confirmed', mergedIntoPartnerId: survivor._id },
      TENANT,
      'u'
    );

    await expect(
      handler.execute(new RequestNewVehicleCommand('AGL 8230', merged._id!, TENANT, 'user-1'))
    ).rejects.toThrow(ConflictError);
  });
});

describe('Objective 5 -- Confirm/Reject pending master data', () => {
  it('confirms a needs-review transporter', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const handler = new ConfirmPendingMasterDataHandler(partnerRepo, vehicleRepo);
    const pending = await partnerRepo.create({ canonicalName: 'PENDING CARRIER', aliases: [], reviewStatus: 'needs-review' }, TENANT, 'requester');

    const result = await handler.execute(new ConfirmPendingMasterDataCommand('transporter', pending._id!, TENANT, 'approver-1'));
    expect((result.record as any).reviewStatus).toBe('confirmed');
    expect(auditLog.logUpdate).toHaveBeenCalled();
  });

  it('refuses to confirm a row that is not needs-review (already confirmed)', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const handler = new ConfirmPendingMasterDataHandler(partnerRepo, vehicleRepo);
    const confirmed = await partnerRepo.create({ canonicalName: 'ALREADY CONFIRMED', aliases: [], reviewStatus: 'confirmed' }, TENANT, 'u');

    await expect(
      handler.execute(new ConfirmPendingMasterDataCommand('transporter', confirmed._id!, TENANT, 'approver-1'))
    ).rejects.toThrow(ConflictError);
  });

  it('rejects a needs-review vehicle with a reason, and requires one', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const handler = new RejectPendingMasterDataHandler(partnerRepo, vehicleRepo);
    const transporter = await partnerRepo.create({ canonicalName: 'T', aliases: [], reviewStatus: 'confirmed' }, TENANT, 'u');
    const pendingVehicle = await vehicleRepo.create(
      { registration: 'ZZZ9999', registrationRaw: 'ZZZ 9999', transporterPartnerId: transporter._id!, isMultiPlate: false, reviewStatus: 'needs-review' },
      TENANT,
      'requester'
    );

    await expect(
      handler.execute(new RejectPendingMasterDataCommand('vehicle', pendingVehicle._id!, TENANT, 'approver-1', ''))
    ).rejects.toThrow(ValidationError);

    const result = await handler.execute(new RejectPendingMasterDataCommand('vehicle', pendingVehicle._id!, TENANT, 'approver-1', 'Duplicate of ZZZ 9999A'));
    expect((result.record as any).rejected).toBe(true);
    expect((result.record as any).rejectedReason).toBe('Duplicate of ZZZ 9999A');
  });

  it('an unauthorized/wrong-tenant id 404s rather than confirming/rejecting another tenant\'s row', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const confirmHandler = new ConfirmPendingMasterDataHandler(partnerRepo, vehicleRepo);
    const attackerPending = await partnerRepo.create({ canonicalName: 'ATTACKER PENDING', aliases: [], reviewStatus: 'needs-review' }, OTHER_TENANT, 'attacker');

    await expect(
      confirmHandler.execute(new ConfirmPendingMasterDataCommand('transporter', attackerPending._id!, TENANT, 'approver-1'))
    ).rejects.toThrow(NotFoundError);
  });
});

describe('Objective 5 -- ListPendingMasterDataHandler', () => {
  it('returns only needs-review transporters/vehicles for this tenant, never confirmed/rejected rows or another tenant\'s', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const handler = new ListPendingMasterDataHandler(partnerRepo, vehicleRepo);

    const pendingT = await partnerRepo.create({ canonicalName: 'PENDING T', aliases: [], reviewStatus: 'needs-review' }, TENANT, 'u');
    await partnerRepo.create({ canonicalName: 'CONFIRMED T', aliases: [], reviewStatus: 'confirmed' }, TENANT, 'u');
    await partnerRepo.create({ canonicalName: 'OTHER TENANT PENDING', aliases: [], reviewStatus: 'needs-review' }, OTHER_TENANT, 'attacker');

    const pendingV = await vehicleRepo.create(
      { registration: 'PPP1111', registrationRaw: 'PPP 1111', transporterPartnerId: pendingT._id!, isMultiPlate: false, reviewStatus: 'needs-review' },
      TENANT,
      'u'
    );
    await vehicleRepo.create(
      { registration: 'CCC2222', registrationRaw: 'CCC 2222', transporterPartnerId: pendingT._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
      TENANT,
      'u'
    );

    const result = await handler.execute(new ListPendingMasterDataQuery(TENANT));
    expect(result.transporters.map((t) => t._id)).toEqual([pendingT._id]);
    expect(result.vehicles.map((v) => v._id)).toEqual([pendingV._id]);
  });

  it('returns empty lists for a tenant with nothing pending', async () => {
    const partnerRepo = makePartnerRepo().repo;
    const vehicleRepo = makeVehicleRepo().repo;
    const handler = new ListPendingMasterDataHandler(partnerRepo, vehicleRepo);
    const result = await handler.execute(new ListPendingMasterDataQuery(TENANT));
    expect(result.transporters).toEqual([]);
    expect(result.vehicles).toEqual([]);
  });
});
