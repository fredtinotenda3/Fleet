// tests/unit/trips/map-assisted-trip.handler.spec.ts
//
// PART 3/4/5 -- the single most security-relevant guarantee of the
// map-assisted trip log: a client can submit whatever `route` or
// `distance_evidence` it likes alongside its stops, and it has NO
// effect on the saved trip. The server always recomputes the route
// itself, from the submitted stop coordinates, via
// routeDistanceService -- never from a client-supplied distance. A
// caller who could inflate a submitted "route" would otherwise be able
// to inflate cost-per-km reporting for that vehicle.
//
// Covers both CreateTripHandler and UpdateTripHandler, since both
// independently implement this recomputation (see each handler's own
// `resolveTripDistance` / mode === 'map' branch).

import { CreateTripHandler } from '@/modules/trips/commands/handlers/create-trip.handler';
import { CreateTripCommand } from '@/modules/trips/commands/create-trip.command';
import { UpdateTripHandler } from '@/modules/trips/commands/handlers/update-trip.handler';
import { UpdateTripCommand } from '@/modules/trips/commands/update-trip.command';
import { userWriteScope } from '@/server/tenancy/write-scope';
import { routeDistanceService } from '@/modules/telematics/services/route-distance.service';
import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { AppError, ValidationError } from '@/server/errors/app.errors';
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

const mockedRouteDistance = routeDistanceService as jest.Mocked<typeof routeDistanceService>;
const mockedTelematics = telematicsRepository as jest.Mocked<typeof telematicsRepository>;
const mockedVehicleResolver = vehicleWriteResolver as jest.Mocked<typeof vehicleWriteResolver>;
const mockedConnect = connectToDatabase as unknown as jest.Mock;

const TENANT_ID = 'test-fleet-co-abc123';
const CONTEXT: TenantContext = {
  organizationId: TENANT_ID,
  organizationName: 'Test Fleet Co',
  accessibleOrgUnitIds: null,
  isPlatformScope: false,
} as TenantContext;
const SCOPE = userWriteScope(CONTEXT);

const VEHICLE = { _id: 'vehicle-1', license_plate: 'ABC100', tenantId: TENANT_ID, orgUnitId: undefined };

const START = {
  sequence: 0,
  role: 'start' as const,
  label: 'Depot',
  lat: -17.82,
  lng: 31.05,
  geocodeProvenance: 'map-click' as const,
};
const END = {
  sequence: 1,
  role: 'end' as const,
  label: 'Warehouse',
  lat: -17.78,
  lng: 31.08,
  geocodeProvenance: 'map-click' as const,
};

/** A forged, inflated route/evidence a malicious or buggy client might attach alongside real stops. */
const FORGED_ROUTE = {
  provider: 'osrm',
  calculatedAt: new Date().toISOString(),
  legs: [{ fromSequence: 0, toSequence: 1, distanceKm: 9999 }],
  totalDistanceKm: 9999,
};
const FORGED_EVIDENCE = {
  mapDerived: { valueKm: 9999, source: 'map-derived', method: 'forged', calculatedAt: new Date().toISOString() },
};

/** What the REAL routing engine actually computed -- the only figure that must survive into the saved trip. */
const REAL_ROUTE = {
  legs: [{ fromSequence: 0, toSequence: 1, distanceKm: 12.345 }],
  totalDistanceKm: 12.345,
  geometry: [[31.05, -17.82], [31.08, -17.78]] as [number, number][],
};

function fakeUnitsAndNoDuplicateDb() {
  const findOne = jest
    .fn()
    .mockImplementation(async (query: Record<string, unknown>) => {
      if ('type' in query) return { unit_id: 'unit-km', type: 'distance' }; // tblunits lookup
      return null; // no duplicate trip
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

describe('CreateTripHandler -- map mode never trusts a client-submitted route/distance', () => {
  it('ignores a forged route/distance_evidence and uses only the server-computed route', async () => {
    mockedRouteDistance.computeRoute.mockResolvedValue(REAL_ROUTE);
    const tripRepo = { create: jest.fn(async (data) => ({ _id: 'trip-1', ...data })) };
    const handler = new CreateTripHandler(tripRepo as never);

    const command = new CreateTripCommand(
      {
        license_plate: 'ABC100',
        mode: 'map',
        date: '2026-09-15',
        unit_id: 'unit-km',
        stops: [START, END],
        // Attacker/buggy-client-controlled fields -- must have NO effect.
        route: FORGED_ROUTE,
        distance_evidence: FORGED_EVIDENCE,
        trip_distance: 9999,
        allowDuplicate: true,
      },
      TENANT_ID,
      SCOPE
    );

    const created = await handler.execute(command);

    // The routing engine was called with the REAL stop coordinates --
    // never with anything derived from the forged fields.
    expect(mockedRouteDistance.computeRoute).toHaveBeenCalledWith([
      { sequence: 0, lat: -17.82, lng: 31.05 },
      { sequence: 1, lat: -17.78, lng: 31.08 },
    ]);

    expect(created.distance_calculated).toBe(12.345);
    expect(created.distance_source).toBe('map-derived');
    expect(created.route).toMatchObject({ totalDistanceKm: 12.345, provider: 'osrm' });
    expect(created.distance_evidence).toEqual({
      mapDerived: expect.objectContaining({ valueKm: 12.345, source: 'map-derived' }),
    });

    // The forged numbers appear NOWHERE in the saved record.
    const serialized = JSON.stringify(created);
    expect(serialized).not.toContain('9999');

    // PART 3/5 hygiene fix: a stray trip_distance must not survive onto
    // a map-mode trip even though the client sent one.
    expect(created.trip_distance).toBeUndefined();
  });

  it('throws MAP_ROUTE_UNAVAILABLE (422) when the routing engine cannot find a route, rather than falling back to any distance', async () => {
    mockedRouteDistance.computeRoute.mockResolvedValue(undefined);
    const tripRepo = { create: jest.fn() };
    const handler = new CreateTripHandler(tripRepo as never);

    const command = new CreateTripCommand(
      { license_plate: 'ABC100', mode: 'map', date: '2026-09-15', unit_id: 'unit-km', stops: [START, END] },
      TENANT_ID,
      SCOPE
    );

    await expect(handler.execute(command)).rejects.toMatchObject({
      code: 'MAP_ROUTE_UNAVAILABLE',
      statusCode: 422,
    });
    expect(tripRepo.create).not.toHaveBeenCalled();
  });

  it('records telemetry_available from the vehicle\'s registered device, not from the distance source', async () => {
    mockedRouteDistance.computeRoute.mockResolvedValue(REAL_ROUTE);
    mockedTelematics.getDeviceForVehicle.mockResolvedValue({ status: 'active' } as never);
    const tripRepo = { create: jest.fn(async (data) => ({ _id: 'trip-1', ...data })) };
    const handler = new CreateTripHandler(tripRepo as never);

    const command = new CreateTripCommand(
      { license_plate: 'ABC100', mode: 'map', date: '2026-09-15', unit_id: 'unit-km', stops: [START, END] },
      TENANT_ID,
      SCOPE
    );

    const created = await handler.execute(command);
    // A vehicle CAN have an active tracker and still be logged via the
    // map (e.g. the driver didn't have the tracker's trip picked up) --
    // the field says the vehicle has telemetry, independent of what
    // produced THIS trip's distance.
    expect(created.telemetry_available).toBe(true);
    expect(created.distance_source).toBe('map-derived');
  });
});

describe('UpdateTripHandler -- editing a map-assisted trip\'s stops recomputes the route server-side', () => {
  const MOVED_END = { ...END, lat: -17.70, lng: 31.10 };

  it('recomputes distance from the NEW stops and ignores any client-submitted route/distance', async () => {
    mockedRouteDistance.computeRoute.mockResolvedValue({
      legs: [{ fromSequence: 0, toSequence: 1, distanceKm: 20 }],
      totalDistanceKm: 20,
    });
    const tripRepo = { update: jest.fn(async (id, data) => ({ _id: id, ...data })) };
    const handler = new UpdateTripHandler(tripRepo as never);

    const command = new UpdateTripCommand(
      'trip-1',
      {
        mode: 'map',
        stops: [START, MOVED_END],
        route: FORGED_ROUTE,
        distance_calculated: 9999,
      },
      TENANT_ID,
      SCOPE
    );

    await handler.execute(command);

    expect(mockedRouteDistance.computeRoute).toHaveBeenCalledWith([
      { sequence: 0, lat: -17.82, lng: 31.05 },
      { sequence: 1, lat: -17.7, lng: 31.1 },
    ]);
    const [, savedData] = tripRepo.update.mock.calls[0];
    expect(savedData.distance_calculated).toBe(20);
    expect(JSON.stringify(savedData)).not.toContain('9999');
  });

  it('rejects an update that leaves a map-assisted trip with fewer than 2 stops', async () => {
    const tripRepo = { update: jest.fn() };
    const handler = new UpdateTripHandler(tripRepo as never);

    const command = new UpdateTripCommand('trip-1', { mode: 'map', stops: [START] }, TENANT_ID, SCOPE);

    await expect(handler.execute(command)).rejects.toBeInstanceOf(ValidationError);
    expect(tripRepo.update).not.toHaveBeenCalled();
  });

  it('nulls out route/stops when a trip is switched away from map mode', async () => {
    const tripRepo = { update: jest.fn(async (id, data) => ({ _id: id, ...data })) };
    const handler = new UpdateTripHandler(tripRepo as never);

    const command = new UpdateTripCommand('trip-1', { mode: 'distance', trip_distance: 42 }, TENANT_ID, SCOPE);

    await handler.execute(command);

    const [, savedData] = tripRepo.update.mock.calls[0];
    expect(savedData.route).toBeNull();
    expect(savedData.stops).toBeNull();
    expect(savedData.distance_calculated).toBe(42);
    expect(savedData.distance_source).toBe('manual');
  });
});
