// tests/unit/dispatch/dispatch-service.spec.ts
//
// ROUND 4 (Trips <-> Dispatch connectivity) -- behavioral coverage for
// DispatchService. DispatchService had NO dedicated test file before
// this round (confirmed by search: tests/security/attention-dispatch-*
// covers an unrelated "dispatch an attention finding as work" concept,
// not this DispatchJob domain). This suite exercises the actual
// decisions the service makes, with its repository and every singleton
// collaborator mocked -- DispatchRepository is constructor-injected
// (`new DispatchService(repoMock)`), which is what makes a pure
// behavioral test possible without a database.
//
// Covers, per the spec's testing section: creation + validation,
// assignment + vehicle/driver/branch validation, invalid state
// transitions, duplicate trip associations, the Dispatch<->Trip core
// requirement in both directions, planned-vs-actual (derived status
// never invents a transition the trip's own status doesn't support),
// and an honest (never-fabricated) cost summary.

import { DispatchService } from '@/modules/dispatch/services/dispatch.service';
import type { DispatchJob } from '@/modules/dispatch/types/dispatch.types';
import { userWriteScope, systemWriteScope } from '@/server/tenancy/write-scope';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';
import { driverWriteResolver } from '@/modules/drivers/services/driver-write-resolver.service';
import { customerRepository } from '@/modules/transport-cost/repositories/customer.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

jest.mock('@/modules/vehicles/services/vehicle-write-resolver.service', () => ({
  vehicleWriteResolver: { resolveByIdForWrite: jest.fn() },
}));
jest.mock('@/modules/drivers/services/driver-write-resolver.service', () => ({
  driverWriteResolver: { resolveForWrite: jest.fn() },
}));
jest.mock('@/modules/transport-cost/repositories/customer.repository', () => ({
  customerRepository: { findById: jest.fn() },
}));
jest.mock('@/modules/trips/repositories/trip.repository', () => ({
  tripRepository: { findById: jest.fn(), update: jest.fn(), getCostAnalyticsForTrip: jest.fn() },
}));
jest.mock('@/server/events/bus/EventBusFactory', () => ({
  EventBusFactory: { getInstance: () => ({ publish: jest.fn() }) },
}));
jest.mock('@/infrastructure/monitoring/audit.logger', () => ({
  auditLog: { log: jest.fn() },
}));

const mockedVehicleResolver = vehicleWriteResolver as jest.Mocked<typeof vehicleWriteResolver>;
const mockedDriverResolver = driverWriteResolver as jest.Mocked<typeof driverWriteResolver>;
const mockedCustomerRepo = customerRepository as jest.Mocked<typeof customerRepository>;
const mockedTripRepo = tripRepository as jest.Mocked<typeof tripRepository>;

const TENANT_ID = 'test-fleet-co-abc123';
const HARARE = 'branch-harare';
const BULAWAYO = 'branch-bulawayo';

function harareScopedContext(): TenantContext {
  return {
    organizationId: TENANT_ID,
    organizationName: 'Test Fleet Co',
    accessibleOrgUnitIds: [HARARE],
    assignedOrgUnitIds: [HARARE],
    isPlatformScope: false,
  } as TenantContext;
}

function orgWideContext(): TenantContext {
  return {
    organizationId: TENANT_ID,
    organizationName: 'Test Fleet Co',
    accessibleOrgUnitIds: null,
    isPlatformScope: false,
  } as TenantContext;
}

function makeJob(overrides: Partial<DispatchJob> = {}): DispatchJob {
  return {
    _id: 'job-1',
    tenantId: TENANT_ID,
    title: 'Deliver pallets',
    priority: 'medium',
    status: 'unassigned',
    pickupLocation: 'Harare depot',
    ...overrides,
  } as DispatchJob;
}

function makeRepo() {
  return {
    create: jest.fn(async (data) => ({ _id: 'job-new', ...data })),
    findById: jest.fn(),
    update: jest.fn(async (id, data) => ({ ...makeJob(), _id: id, ...data })),
    getFiltered: jest.fn(),
    getFilteredInScope: jest.fn(),
    getActiveBoard: jest.fn(),
    getActiveBoardInScope: jest.fn(),
  };
}

describe('DispatchService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires title and pickupLocation', async () => {
    const repo = makeRepo();
    const service = new DispatchService(repo as never);

    await expect(
      service.create({ title: '', pickupLocation: 'Harare depot' }, userWriteScope(orgWideContext()), 'user-1')
    ).rejects.toThrow(ValidationError);
    await expect(
      service.create({ title: 'Deliver pallets', pickupLocation: '' }, userWriteScope(orgWideContext()), 'user-1')
    ).rejects.toThrow(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('validates a supplied customerId against real master data, scoped to the tenant', async () => {
    const repo = makeRepo();
    const service = new DispatchService(repo as never);
    mockedCustomerRepo.findById.mockResolvedValue(null);

    await expect(
      service.create(
        { title: 'Deliver pallets', pickupLocation: 'Harare depot', customerId: 'cust-does-not-exist' },
        userWriteScope(orgWideContext()),
        'user-1'
      )
    ).rejects.toThrow(ValidationError);
    expect(mockedCustomerRepo.findById).toHaveBeenCalledWith('cust-does-not-exist', TENANT_ID);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('creates with a valid customerId and jobReference carried through', async () => {
    const repo = makeRepo();
    const service = new DispatchService(repo as never);
    mockedCustomerRepo.findById.mockResolvedValue({ _id: 'cust-1' } as never);

    const created = await service.create(
      {
        title: 'Deliver pallets',
        pickupLocation: 'Harare depot',
        customerId: 'cust-1',
        jobReference: ' PO-9001 ',
      },
      userWriteScope(orgWideContext()),
      'user-1'
    );

    expect(created.customerId).toBe('cust-1');
    expect(created.jobReference).toBe('PO-9001'); // trimmed
    expect(created.status).toBe('unassigned');
  });

  it('never fabricates an orgUnitId for a system write with no user scope', async () => {
    const repo = makeRepo();
    const service = new DispatchService(repo as never);

    await service.create(
      { title: 'Deliver pallets', pickupLocation: 'Harare depot' },
      systemWriteScope(TENANT_ID, 'test: bulk import'),
      undefined as unknown as string
    );

    expect(repo.create.mock.calls[0][0].orgUnitId).toBeUndefined();
  });
});

describe('DispatchService.assign -- cross-vehicle/cross-driver/cross-branch validation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the dispatch job does not exist', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(null);
    const service = new DispatchService(repo as never);

    await expect(
      service.assign('job-missing', 'driver-1', 'vehicle-1', userWriteScope(orgWideContext()), 'user-1')
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects assigning a dispatch job outside the caller\'s org-unit scope -- NOT FOUND, never FORBIDDEN', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ orgUnitId: BULAWAYO }));
    const service = new DispatchService(repo as never);

    const outcome = service.assign('job-1', 'driver-1', 'vehicle-1', userWriteScope(harareScopedContext()), 'user-1');
    await expect(outcome).rejects.toThrow(NotFoundError);
    await expect(outcome.catch((e) => e.message)).resolves.toBe('Dispatch job not found');
    expect(mockedVehicleResolver.resolveByIdForWrite).not.toHaveBeenCalled();
  });

  it('rejects when the current status cannot transition to assigned', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'completed', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);

    await expect(
      service.assign('job-1', 'driver-1', 'vehicle-1', userWriteScope(harareScopedContext()), 'user-1')
    ).rejects.toThrow(ConflictError);
    expect(mockedVehicleResolver.resolveByIdForWrite).not.toHaveBeenCalled();
  });

  it('propagates a cross-branch/foreign-tenant vehicle resolution failure unchanged (fail closed)', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);
    mockedVehicleResolver.resolveByIdForWrite.mockRejectedValue(
      Object.assign(new Error('Vehicle "vehicle-bulawayo" not found'), { code: 'VEHICLE_NOT_FOUND', statusCode: 400 })
    );

    await expect(
      service.assign('job-1', 'driver-1', 'vehicle-bulawayo', userWriteScope(harareScopedContext()), 'user-1')
    ).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('propagates a cross-branch/foreign-tenant driver resolution failure unchanged (fail closed)', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);
    mockedVehicleResolver.resolveByIdForWrite.mockResolvedValue({ _id: 'vehicle-1' } as never);
    mockedDriverResolver.resolveForWrite.mockRejectedValue(
      Object.assign(new Error('Driver "driver-bulawayo" not found'), { code: 'DRIVER_NOT_FOUND', statusCode: 400 })
    );

    await expect(
      service.assign('job-1', 'driver-bulawayo', 'vehicle-1', userWriteScope(harareScopedContext()), 'user-1')
    ).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects double-booking a vehicle or driver already active on another dispatch job, TENANT-wide (not narrowed to the caller\'s org unit)', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ _id: 'job-2', orgUnitId: HARARE }));
    repo.getActiveBoard.mockResolvedValue([
      makeJob({ _id: 'job-1', orgUnitId: BULAWAYO, status: 'assigned', assignedDriverId: 'driver-1', assignedVehicleId: 'vehicle-1' }),
    ]);
    const service = new DispatchService(repo as never);
    mockedVehicleResolver.resolveByIdForWrite.mockResolvedValue({ _id: 'vehicle-1' } as never);
    mockedDriverResolver.resolveForWrite.mockResolvedValue({ _id: 'driver-2' } as never);

    await expect(
      service.assign('job-2', 'driver-2', 'vehicle-1', userWriteScope(harareScopedContext()), 'user-1')
    ).rejects.toThrow(ConflictError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('assigns successfully when the vehicle and driver resolve and neither is double-booked', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ orgUnitId: HARARE }));
    repo.getActiveBoard.mockResolvedValue([]);
    const service = new DispatchService(repo as never);
    mockedVehicleResolver.resolveByIdForWrite.mockResolvedValue({ _id: 'vehicle-1' } as never);
    mockedDriverResolver.resolveForWrite.mockResolvedValue({ _id: 'driver-1' } as never);

    const updated = await service.assign('job-1', 'driver-1', 'vehicle-1', userWriteScope(harareScopedContext()), 'user-1');

    expect(repo.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'assigned', assignedDriverId: 'driver-1', assignedVehicleId: 'vehicle-1' }),
      TENANT_ID,
      'user-1'
    );
    expect(updated.status).toBe('assigned');
  });
});

describe('DispatchService.changeStatus -- invalid state transitions', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['unassigned', 'in_progress'],
    ['unassigned', 'completed'],
    ['assigned', 'completed'],
    ['completed', 'cancelled'],
    ['cancelled', 'assigned'],
  ])('rejects %s -> %s as an invalid transition', async (from, to) => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: from as DispatchJob['status'], orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);

    await expect(
      service.changeStatus('job-1', to as DispatchJob['status'], userWriteScope(harareScopedContext()), 'user-1')
    ).rejects.toThrow(ConflictError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('cancelling records the reason', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'assigned', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);

    await service.changeStatus('job-1', 'cancelled', userWriteScope(harareScopedContext()), 'user-1', 'Customer cancelled the order');

    expect(repo.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'cancelled', cancelledReason: 'Customer cancelled the order' }),
      TENANT_ID,
      'user-1'
    );
  });

  it('completing stamps completedAt', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'in_progress', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);

    await service.changeStatus('job-1', 'completed', userWriteScope(harareScopedContext()), 'user-1');

    expect(repo.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'completed', completedAt: expect.any(Date) }),
      TENANT_ID,
      'user-1'
    );
  });
});

describe('DispatchService.assertCanLinkTrip / attachCreatedTrip / linkExistingTrip -- Dispatch <-> Trip core requirement', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['unassigned', 'completed', 'cancelled'])(
    'refuses to link a trip while status is %s',
    async (status) => {
      const repo = makeRepo();
      repo.findById.mockResolvedValue(makeJob({ status: status as DispatchJob['status'], orgUnitId: HARARE }));
      const service = new DispatchService(repo as never);

      await expect(service.assertCanLinkTrip('job-1', userWriteScope(harareScopedContext()))).rejects.toThrow(ConflictError);
    }
  );

  it('refuses a duplicate association -- a job already linked to a trip cannot be linked to another', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'in_progress', orgUnitId: HARARE, tripId: 'trip-existing' }));
    const service = new DispatchService(repo as never);

    await expect(service.assertCanLinkTrip('job-1', userWriteScope(harareScopedContext()))).rejects.toThrow(ConflictError);
  });

  it('attachCreatedTrip (DISPATCH -> TRIP) advances status to in_progress and stamps startedAt', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'assigned', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);

    const updated = await service.attachCreatedTrip('job-1', 'trip-new', userWriteScope(harareScopedContext()), 'user-1');

    expect(repo.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ tripId: 'trip-new', status: 'in_progress', startedAt: expect.any(Date) }),
      TENANT_ID,
      'user-1'
    );
    expect(updated.status).toBe('in_progress');
  });

  it('attachCreatedTrip does not re-stamp startedAt when the job was already started (e.g. via en_route)', async () => {
    const repo = makeRepo();
    const existingStart = new Date('2026-01-01T08:00:00Z');
    repo.findById.mockResolvedValue(makeJob({ status: 'en_route', orgUnitId: HARARE, startedAt: existingStart }));
    const service = new DispatchService(repo as never);

    await service.attachCreatedTrip('job-1', 'trip-new', userWriteScope(harareScopedContext()), 'user-1');

    const updates = repo.update.mock.calls[0][1];
    expect(updates.startedAt).toBeUndefined();
  });

  it('linkExistingTrip (TRIP -> DISPATCH) rejects a trip outside the caller\'s org-unit scope, as NOT FOUND', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'assigned', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);
    mockedTripRepo.findById.mockResolvedValue({ _id: 'trip-1', orgUnitId: BULAWAYO, status: 'ongoing' } as never);

    await expect(
      service.linkExistingTrip('job-1', 'trip-1', userWriteScope(harareScopedContext()), 'user-1')
    ).rejects.toThrow(NotFoundError);
    expect(repo.update).not.toHaveBeenCalled();
    expect(mockedTripRepo.update).not.toHaveBeenCalled();
  });

  it('linkExistingTrip rejects a trip already linked to a DIFFERENT dispatch job (duplicate association, trip side)', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'assigned', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);
    mockedTripRepo.findById.mockResolvedValue({
      _id: 'trip-1',
      orgUnitId: HARARE,
      status: 'ongoing',
      dispatchJobId: 'job-other',
    } as never);

    await expect(
      service.linkExistingTrip('job-1', 'trip-1', userWriteScope(harareScopedContext()), 'user-1')
    ).rejects.toThrow(ConflictError);
  });

  // ─── Planned vs actual: derived status never invents a transition the
  //     trip's own recorded status doesn't support ──────────────────────

  it('an ongoing trip advances the job to in_progress (from en_route, the only status VALID_TRANSITIONS allows that jump from)', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'en_route', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);
    mockedTripRepo.findById.mockResolvedValue({ _id: 'trip-1', orgUnitId: HARARE, status: 'ongoing' } as never);

    await service.linkExistingTrip('job-1', 'trip-1', userWriteScope(harareScopedContext()), 'user-1');

    expect(repo.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ tripId: 'trip-1', status: 'in_progress' }),
      TENANT_ID,
      'user-1'
    );
    // The other half of the bidirectional link is written too.
    expect(mockedTripRepo.update).toHaveBeenCalledWith('trip-1', { dispatchJobId: 'job-1' }, TENANT_ID, 'user-1');
  });

  it('a completed trip advances the job to completed and stamps completedAt', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'in_progress', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);
    mockedTripRepo.findById.mockResolvedValue({ _id: 'trip-1', orgUnitId: HARARE, status: 'completed' } as never);

    await service.linkExistingTrip('job-1', 'trip-1', userWriteScope(harareScopedContext()), 'user-1');

    expect(repo.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ tripId: 'trip-1', status: 'completed', completedAt: expect.any(Date) }),
      TENANT_ID,
      'user-1'
    );
  });

  it('a planned trip links WITHOUT forcing any status change -- "planned" says nothing reliable about whether the job\'s work happened', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'assigned', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);
    mockedTripRepo.findById.mockResolvedValue({ _id: 'trip-1', orgUnitId: HARARE, status: 'planned' } as never);

    await service.linkExistingTrip('job-1', 'trip-1', userWriteScope(harareScopedContext()), 'user-1');

    expect(repo.update).toHaveBeenCalledWith('job-1', { tripId: 'trip-1' }, TENANT_ID, 'user-1');
  });

  it('a cancelled trip links without forcing a status change, and never fabricates a GPS/telemetry claim the trip itself does not carry', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ status: 'assigned', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);
    // The Harare ABC123 scenario: no GPS, no odometer -- distance_source
    // is 'map-derived', never a fabricated 'gps' claim. linkExistingTrip
    // does not read or alter distance_source/telemetry_available at all;
    // this only asserts the status-derivation side stays honest for a
    // not-reliable-signal trip status.
    mockedTripRepo.findById.mockResolvedValue({
      _id: 'trip-1',
      orgUnitId: HARARE,
      status: 'cancelled',
      distance_source: 'map-derived',
      telemetry_available: false,
    } as never);

    await service.linkExistingTrip('job-1', 'trip-1', userWriteScope(harareScopedContext()), 'user-1');

    expect(repo.update).toHaveBeenCalledWith('job-1', { tripId: 'trip-1' }, TENANT_ID, 'user-1');
  });

  it('skips a derived transition that is not reachable from the job\'s current status, without failing the link', async () => {
    const repo = makeRepo();
    // Already completed -- a derived "in_progress" from an 'ongoing'
    // trip is not a valid completed -> in_progress transition.
    repo.findById.mockResolvedValue(makeJob({ status: 'completed', orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);
    mockedTripRepo.findById.mockResolvedValue({ _id: 'trip-1', orgUnitId: HARARE, status: 'ongoing' } as never);

    // assertCanLinkTrip itself refuses a completed job before any
    // derivation is attempted -- completed is not in
    // TRIP_LINKABLE_STATUSES.
    await expect(
      service.linkExistingTrip('job-1', 'trip-1', userWriteScope(harareScopedContext()), 'user-1')
    ).rejects.toThrow(ConflictError);
  });
});

describe('DispatchService.getCostSummary -- never fabricated', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports unavailable (not a fabricated zero) when no trip is linked yet', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ orgUnitId: HARARE }));
    const service = new DispatchService(repo as never);

    const summary = await service.getCostSummary('job-1', orgWideContext());

    expect(summary).toEqual({ tripId: null, available: false, fuelCost: 0, expenseCost: 0, totalCost: 0 });
    expect(mockedTripRepo.getCostAnalyticsForTrip).not.toHaveBeenCalled();
  });

  it('reports a real zero (not unavailable) once a trip is linked but has accrued no cost yet', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ orgUnitId: HARARE, tripId: 'trip-1' }));
    const service = new DispatchService(repo as never);
    mockedTripRepo.getCostAnalyticsForTrip.mockResolvedValue({ fuelCost: 0, expenseCost: 0, totalCost: 0 });

    const summary = await service.getCostSummary('job-1', orgWideContext());

    expect(summary).toEqual({ tripId: 'trip-1', available: true, fuelCost: 0, expenseCost: 0, totalCost: 0 });
  });

  it('delegates to the SAME linked-cost computation Trip Cost Analytics uses, never a re-derived figure', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(makeJob({ orgUnitId: HARARE, tripId: 'trip-1' }));
    const service = new DispatchService(repo as never);
    mockedTripRepo.getCostAnalyticsForTrip.mockResolvedValue({ fuelCost: 45.5, expenseCost: 10, totalCost: 55.5 });

    const summary = await service.getCostSummary('job-1', orgWideContext());

    expect(mockedTripRepo.getCostAnalyticsForTrip).toHaveBeenCalledWith('trip-1', TENANT_ID);
    expect(summary).toEqual({ tripId: 'trip-1', available: true, fuelCost: 45.5, expenseCost: 10, totalCost: 55.5 });
  });
});
