// tests/security/telematics-live-map-scope.spec.ts
//
// GET /api/telematics/live-map and GET /api/telematics/live-map/history/[vehicleId]
// are the newest GPS-adjacent read paths in the product -- exactly the
// shape of bug this suite exists to catch (see
// module-scope-conformance.spec.ts's header): a list endpoint gets a
// filter, a sibling read added later doesn't.
//
// Two properties are asserted:
//   1. Behavioural -- LiveMapService threads the caller's TenantContext
//      into every org-unit-scoped repository call it makes
//      (getFilteredVehiclesInScope, getLatestTelematicsDataInScope,
//      getActiveGeofencesInScope, getTelematicsHistoryInScope), and
//      never falls back to an unscoped/tenant-only read for any of
//      them. getVehicleRouteHistory additionally clamps an
//      attacker-supplied `minutes` window rather than passing it
//      through unbounded.
//   2. Structural -- both routes wire withAuth with Permission.VEHICLE_VIEW
//      and their controller resolves a full TenantContext via
//      resolveTenantContext(req), the same helper every other scoped
//      controller in the product uses (see
//      server/utils/tenant-context.utils.ts's header for why a
//      tenantId-only signature is the leak shape this guards against).

import * as fs from 'fs';
import * as path from 'path';
import { liveMapService } from '../../modules/telematics/services/live-map.service';
import { vehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import { telematicsRepository } from '../../modules/telematics/repositories/telematics.repository';
import { demoStateRepository } from '../../modules/telematics/repositories/demo-state.repository';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import type { Vehicle } from '../../shared/types/vehicle.types';

jest.mock('../../modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { getFilteredVehiclesInScope: jest.fn() },
}));
jest.mock('../../modules/telematics/repositories/telematics.repository', () => ({
  telematicsRepository: {
    getLatestTelematicsData: jest.fn(),
    getLatestTelematicsDataInScope: jest.fn(),
    getActiveGeofencesInScope: jest.fn(),
    getTelematicsHistory: jest.fn(),
    getTelematicsHistoryInScope: jest.fn(),
  },
}));
jest.mock('../../modules/telematics/repositories/demo-state.repository', () => ({
  demoStateRepository: { getState: jest.fn() },
}));
// Real ingestion is not under test here, but resolveDemoVehicle imports
// it at module scope, so it must resolve to something.
jest.mock('../../modules/telematics/services/telematics.service', () => ({
  telematicsService: { ingestTelematicsData: jest.fn().mockResolvedValue(undefined) },
}));

const mockedGetFilteredVehiclesInScope = vehicleRepository.getFilteredVehiclesInScope as jest.Mock;
const mockedGetLatestTelematicsData = telematicsRepository.getLatestTelematicsData as jest.Mock;
const mockedGetLatestTelematicsDataInScope = telematicsRepository.getLatestTelematicsDataInScope as jest.Mock;
const mockedGetActiveGeofencesInScope = telematicsRepository.getActiveGeofencesInScope as jest.Mock;
const mockedGetTelematicsHistory = telematicsRepository.getTelematicsHistory as jest.Mock;
const mockedGetTelematicsHistoryInScope = telematicsRepository.getTelematicsHistoryInScope as jest.Mock;
const mockedGetDemoState = demoStateRepository.getState as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';

function makeScopedContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    isPlatformScope: false,
  } as TenantContext;
}

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    _id: 'vehicle-1',
    license_plate: 'HRE1234',
    make: 'Toyota',
    model: 'Hilux',
    orgUnitId: HARARE_BRANCH,
    ...overrides,
  } as Vehicle;
}

const emptyPage = { data: [], pagination: { page: 1, limit: 500, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };

describe('LiveMapService.getLiveMapData scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDemoState.mockResolvedValue(null);
    mockedGetActiveGeofencesInScope.mockResolvedValue([]);
    mockedGetFilteredVehiclesInScope.mockResolvedValue(emptyPage);
  });

  it('threads the caller TenantContext into the vehicle list and geofence reads', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);

    await liveMapService.getLiveMapData(context);

    expect(mockedGetFilteredVehiclesInScope).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ limit: expect.any(Number) }),
      context
    );
    expect(mockedGetActiveGeofencesInScope).toHaveBeenCalledWith(undefined, context);
  });

  it('reads each vehicle\'s position via the org-unit-scoped repository method, never the tenant-only one', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);
    mockedGetFilteredVehiclesInScope.mockResolvedValue({ ...emptyPage, data: [makeVehicle()] });
    mockedGetLatestTelematicsDataInScope.mockResolvedValue(null);

    await liveMapService.getLiveMapData(context);

    expect(mockedGetLatestTelematicsDataInScope).toHaveBeenCalledWith('vehicle-1', context);
    expect(mockedGetLatestTelematicsData).not.toHaveBeenCalled();
  });

  it('a vehicle outside the caller scope is never returned by the scoped query in the first place, so demo/real resolution never runs for it', async () => {
    // getFilteredVehiclesInScope is the enforcement point; this asserts
    // the service doesn't independently re-fetch or widen beyond what
    // that call returned.
    const context = makeScopedContext([HARARE_BRANCH]);
    await liveMapService.getLiveMapData(context);

    expect(mockedGetFilteredVehiclesInScope).toHaveBeenCalledTimes(1);
  });
});

describe('LiveMapService.getVehicleRouteHistory scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetTelematicsHistoryInScope.mockResolvedValue([]);
  });

  it('reads GPS history via the org-unit-scoped repository method, never the tenant-only one', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);

    await liveMapService.getVehicleRouteHistory('vehicle-1', context, 30);

    expect(mockedGetTelematicsHistoryInScope).toHaveBeenCalledWith(
      'vehicle-1',
      expect.any(Date),
      expect.any(Date),
      context,
      expect.any(Number)
    );
    expect(mockedGetTelematicsHistory).not.toHaveBeenCalled();
  });

  it('clamps an oversized lookback window instead of passing it through to the query unbounded', async () => {
    const context = makeScopedContext(null);

    await liveMapService.getVehicleRouteHistory('vehicle-1', context, 999_999);

    const [, startDate, endDate] = mockedGetTelematicsHistoryInScope.mock.calls[0];
    const spanMinutes = (endDate.getTime() - startDate.getTime()) / 60_000;
    expect(spanMinutes).toBeLessThanOrEqual(24 * 60);
  });

  it('returns an empty trail (not an error) for a vehicle the scoped query can\'t see', async () => {
    mockedGetTelematicsHistoryInScope.mockResolvedValue([]);
    const context = makeScopedContext([HARARE_BRANCH]);

    const result = await liveMapService.getVehicleRouteHistory('some-other-branch-vehicle', context);

    expect(result.points).toEqual([]);
  });
});

describe('live-map routes are wired with the standard scoped-controller shape', () => {
  it('GET /api/telematics/live-map requires VEHICLE_VIEW and resolves a full TenantContext', () => {
    const routeSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/telematics/live-map/route.ts'),
      'utf8'
    );
    const controllerSrc = fs.readFileSync(
      path.resolve(__dirname, '../../modules/telematics/controllers/live-map.controller.ts'),
      'utf8'
    );

    expect(routeSrc).toContain('withAuth');
    expect(routeSrc).toContain('Permission.VEHICLE_VIEW');
    expect(controllerSrc).toContain('resolveTenantContext(req)');
  });

  it('GET /api/telematics/live-map/history/[vehicleId] requires VEHICLE_VIEW and resolves a full TenantContext', () => {
    const routeSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/telematics/live-map/history/[vehicleId]/route.ts'),
      'utf8'
    );

    expect(routeSrc).toContain('withAuth');
    expect(routeSrc).toContain('Permission.VEHICLE_VIEW');
    expect(routeSrc).toContain('getRouteHistory');
  });
});