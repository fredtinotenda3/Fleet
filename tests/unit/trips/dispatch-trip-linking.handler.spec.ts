// tests/unit/trips/dispatch-trip-linking.handler.spec.ts
//
// ROUND 4 (Trips <-> Dispatch connectivity) -- the DISPATCH -> TRIP
// direction's handler-side wiring: CreateTripHandler pre-checks a
// supplied `dispatchJobId` via DispatchService.assertCanLinkTrip BEFORE
// writing the trip, and commits the reverse link via
// DispatchService.attachCreatedTrip AFTER the trip write succeeds. See
// that handler's own comments at the two call sites for why the order
// is deliberate (fail before creating an orphaned trip; never make an
// otherwise-successful trip creation look like it failed over the
// narrow race the pre-check already covers).
//
// Uses odometer mode (not map mode) specifically to keep this suite's
// mocking surface to exactly what the dispatch-linking behavior needs,
// reusing map-assisted-trip.handler.spec.ts's established mock
// conventions for everything else (vehicle/driver resolvers, telemetry,
// EventBusFactory, the tblunits/tbltrips lookups).

import { CreateTripHandler } from '@/modules/trips/commands/handlers/create-trip.handler';
import { CreateTripCommand } from '@/modules/trips/commands/create-trip.command';
import { userWriteScope } from '@/server/tenancy/write-scope';
import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';
import { dispatchService } from '@/modules/dispatch/services/dispatch.service';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { ConflictError } from '@/server/errors/app.errors';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

jest.mock('@/modules/telematics/services/route-distance.service', () => ({
  routeDistanceService: { computeRoute: jest.fn() },
}));
jest.mock('@/modules/telematics/repositories/telematics.repository', () => ({
  telematicsRepository: { getDeviceForVehicle: jest.fn() },
}));
jest.mock('@/modules/vehicles/services/vehicle-write-resolver.service', () => ({
  vehicleWriteResolver: { resolveForWrite: jest.fn(), orgUnitIdFor: jest.fn(() => undefined) },
}));
jest.mock('@/modules/drivers/services/driver-write-resolver.service', () => ({
  driverWriteResolver: { resolveForWrite: jest.fn() },
}));
jest.mock('@/infrastructure/database/mongodb', () => jest.fn());
jest.mock('@/server/events/bus/EventBusFactory', () => ({
  EventBusFactory: { getInstance: () => ({ publish: jest.fn() }) },
}));
jest.mock('@/modules/dispatch/services/dispatch.service', () => ({
  dispatchService: { assertCanLinkTrip: jest.fn(), attachCreatedTrip: jest.fn() },
}));

const mockedTelematics = telematicsRepository as jest.Mocked<typeof telematicsRepository>;
const mockedVehicleResolver = vehicleWriteResolver as jest.Mocked<typeof vehicleWriteResolver>;
const mockedConnect = connectToDatabase as unknown as jest.Mock;
const mockedDispatchService = dispatchService as jest.Mocked<typeof dispatchService>;

const TENANT_ID = 'test-fleet-co-abc123';
const CONTEXT: TenantContext = {
  organizationId: TENANT_ID,
  organizationName: 'Test Fleet Co',
  accessibleOrgUnitIds: null,
  isPlatformScope: false,
} as TenantContext;
const SCOPE = userWriteScope(CONTEXT);

const VEHICLE = { _id: 'vehicle-1', license_plate: 'ABC123', tenantId: TENANT_ID, orgUnitId: undefined };

function fakeUnitsAndNoDuplicateDb() {
  const findOne = jest.fn().mockImplementation(async (query: Record<string, unknown>) => {
    if ('type' in query) return { unit_id: 'unit-km', type: 'distance' };
    return null;
  });
  mockedConnect.mockResolvedValue({ collection: () => ({ findOne }) });
  return findOne;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedVehicleResolver.resolveForWrite.mockResolvedValue(VEHICLE as never);
  mockedVehicleResolver.orgUnitIdFor.mockReturnValue(undefined);
  mockedTelematics.getDeviceForVehicle.mockResolvedValue(null);
  fakeUnitsAndNoDuplicateDb();
});

function odometerCommand(extra: Record<string, unknown> = {}) {
  return new CreateTripCommand(
    {
      license_plate: 'ABC123',
      mode: 'odometer',
      date: '2026-09-15',
      unit_id: 'unit-km',
      start_odometer: 1000,
      end_odometer: 1050,
      allowDuplicate: true,
      ...extra,
    },
    TENANT_ID,
    SCOPE,
    'user-1'
  );
}

describe('CreateTripHandler -- DISPATCH -> TRIP linking', () => {
  it('pre-checks dispatchJobId via assertCanLinkTrip BEFORE writing the trip, and never creates an orphaned trip when it is rejected', async () => {
    mockedDispatchService.assertCanLinkTrip.mockRejectedValue(
      new ConflictError('Dispatch job is already linked to a trip')
    );
    const tripRepo = { create: jest.fn() };
    const handler = new CreateTripHandler(tripRepo as never);

    await expect(handler.execute(odometerCommand({ dispatchJobId: 'job-1' }))).rejects.toThrow(ConflictError);

    expect(mockedDispatchService.assertCanLinkTrip).toHaveBeenCalledWith('job-1', SCOPE);
    expect(tripRepo.create).not.toHaveBeenCalled();
    expect(mockedDispatchService.attachCreatedTrip).not.toHaveBeenCalled();
  });

  it('creates the trip carrying dispatchJobId and created_from "dispatch", then attaches it to the job AFTER the write', async () => {
    mockedDispatchService.assertCanLinkTrip.mockResolvedValue({ _id: 'job-1', status: 'assigned' } as never);
    const tripRepo = { create: jest.fn(async (data) => ({ _id: 'trip-new', ...data })) };
    const handler = new CreateTripHandler(tripRepo as never);

    const created = await handler.execute(odometerCommand({ dispatchJobId: 'job-1' }));

    expect(created.dispatchJobId).toBe('job-1');
    expect(created.created_from).toBe('dispatch');

    // The ordering matters: attachCreatedTrip only happens once the
    // trip write has already succeeded, with the trip's real _id.
    expect(tripRepo.create).toHaveBeenCalled();
    expect(mockedDispatchService.attachCreatedTrip).toHaveBeenCalledWith('job-1', 'trip-new', SCOPE, 'user-1');
    const createOrder = tripRepo.create.mock.invocationCallOrder[0];
    const attachOrder = mockedDispatchService.attachCreatedTrip.mock.invocationCallOrder[0];
    expect(attachOrder).toBeGreaterThan(createOrder);
  });

  it('never touches dispatchService when no dispatchJobId is supplied -- ordinary trip creation is unaffected', async () => {
    const tripRepo = { create: jest.fn(async (data) => ({ _id: 'trip-new', ...data })) };
    const handler = new CreateTripHandler(tripRepo as never);

    const created = await handler.execute(odometerCommand());

    expect(created.dispatchJobId).toBeUndefined();
    expect(created.created_from).toBe('manual');
    expect(mockedDispatchService.assertCanLinkTrip).not.toHaveBeenCalled();
    expect(mockedDispatchService.attachCreatedTrip).not.toHaveBeenCalled();
  });

  it('an explicit created_from is not overridden by the dispatchJobId default', async () => {
    mockedDispatchService.assertCanLinkTrip.mockResolvedValue({ _id: 'job-1', status: 'assigned' } as never);
    const tripRepo = { create: jest.fn(async (data) => ({ _id: 'trip-new', ...data })) };
    const handler = new CreateTripHandler(tripRepo as never);

    const created = await handler.execute(odometerCommand({ dispatchJobId: 'job-1', created_from: 'import' }));

    expect(created.created_from).toBe('import');
  });
});
