// tests/security/vehicle-driver-assignment-scope.spec.ts
//
// Controller-level coverage for PATCH /api/vehicles/:id/driver
// (VehicleController.assignVehicleDriver), mirroring the mocking style
// of tests/security/vehicle-identity-resolver.spec.ts and
// tests/security/driver-risk-scope.spec.ts: mock the singleton
// services/repositories the controller calls, use the REAL
// tenantScopeService (pure logic -- exercising it for real is the point
// of a scope test), and drive the controller method directly rather
// than through withAuth/NextRequest plumbing.
//
// Permission enforcement itself (Permission.DRIVER_ASSIGN) lives one
// layer up, in withAuth (server/middleware/with-auth.ts calls
// hasPermission(context, options.permission) and returns 403 before the
// controller is ever reached -- see app/api/vehicles/[id]/driver/route.ts).
// tests/security/route-auth-conformance.spec.ts already asserts every
// route file uses a recognised auth mechanism, and this route uses
// withAuth like every other vehicle route, so the "unauthorized
// assignment is rejected" requirement is covered two ways here: a
// direct exercise of hasPermission() against a context missing the
// permission (the exact check withAuth performs), plus confirmation
// that the route wires DRIVER_ASSIGN through to withAuth at all.

import * as fs from 'fs';
import * as path from 'path';
import { VehicleController } from '../../modules/vehicles/controllers/vehicle.controller';
import { vehicleQueryService } from '../../modules/vehicles/services/vehicle-query.service';
import { vehicleCommandService } from '../../modules/vehicles/services/vehicle-command.service';
import { driverRepository } from '../../modules/drivers/repositories/driver.repository';
import { tenantContextService } from '../../modules/tenancy/services/tenant-context.service';
import { getAuthContext, hasPermission, AuthContext } from '../../server/auth/auth-context';
import { Permission } from '../../server/permissions/roles';
import { NotFoundError, ValidationError } from '../../server/errors/app.errors';
import { Vehicle } from '../../shared/types/vehicle.types';
import { Driver } from '../../shared/types/driver.types';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

jest.mock('../../modules/vehicles/services/vehicle-query.service', () => ({
  vehicleQueryService: { getVehicleById: jest.fn() },
}));
jest.mock('../../modules/vehicles/services/vehicle-command.service', () => ({
  vehicleCommandService: { assignDriver: jest.fn() },
}));
jest.mock('../../modules/drivers/repositories/driver.repository', () => ({
  driverRepository: { findById: jest.fn() },
}));
jest.mock('../../modules/tenancy/services/tenant-context.service', () => ({
  tenantContextService: { resolveContext: jest.fn() },
}));
jest.mock('../../server/auth/auth-context', () => {
  const actual = jest.requireActual('../../server/auth/auth-context');
  return { ...actual, getAuthContext: jest.fn() };
});

const mockedGetVehicleById = vehicleQueryService.getVehicleById as jest.Mock;
const mockedAssignDriver = vehicleCommandService.assignDriver as jest.Mock;
const mockedDriverFindById = driverRepository.findById as jest.Mock;
const mockedResolveContext = tenantContextService.resolveContext as jest.Mock;
const mockedGetAuthContext = getAuthContext as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const OTHER_TENANT = 'another-org-abc123';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';
const USER_ID = 'user-1';

function makeAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: USER_ID,
    tenantId: TENANT,
    roles: ['fleet_manager'],
    permissions: [Permission.DRIVER_ASSIGN],
    canBypassRbac: false,
    isPlatformAdmin: false,
    isSuperAdmin: false,
    orgUnitId: HARARE_BRANCH,
    ...overrides,
  } as AuthContext;
}

function makeTenantContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as TenantContext;
}

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    _id: 'vehicle-1',
    tenantId: TENANT,
    license_plate: 'HRE1234',
    orgUnitId: HARARE_BRANCH,
    currentDriverId: null,
    ...overrides,
  } as unknown as Vehicle;
}

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    _id: 'driver-1',
    tenantId: TENANT,
    name: 'Tendai Moyo',
    orgUnitId: HARARE_BRANCH,
    ...overrides,
  } as unknown as Driver;
}

function makeRequest(body: unknown): any {
  return { json: async () => body };
}

const controller = new VehicleController();

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetAuthContext.mockResolvedValue(makeAuthContext());
  mockedResolveContext.mockResolvedValue(makeTenantContext([HARARE_BRANCH]));
});

describe('VehicleController.assignVehicleDriver -- authorized assignment', () => {
  it('succeeds: resolves the driver, calls assignDriver, and returns the updated vehicle', async () => {
    mockedGetVehicleById.mockResolvedValue(makeVehicle());
    mockedDriverFindById.mockResolvedValue(makeDriver());
    const updated = makeVehicle({ currentDriverId: 'driver-1' });
    mockedAssignDriver.mockResolvedValue(updated);

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: 'driver-1' }),
      'vehicle-1'
    );

    expect(response.status).toBe(200);
    expect(mockedAssignDriver).toHaveBeenCalledWith('vehicle-1', 'driver-1', TENANT, USER_ID);
  });

  it('clearing a driver succeeds (driverId: null, and driverId omitted entirely)', async () => {
    mockedGetVehicleById.mockResolvedValue(makeVehicle({ currentDriverId: 'driver-1' }));
    mockedAssignDriver.mockResolvedValue(makeVehicle({ currentDriverId: null }));

    const withNull = await controller.assignVehicleDriver(makeRequest({ driverId: null }), 'vehicle-1');
    expect(withNull.status).toBe(200);
    expect(mockedAssignDriver).toHaveBeenLastCalledWith('vehicle-1', null, TENANT, USER_ID);

    const withOmitted = await controller.assignVehicleDriver(makeRequest({}), 'vehicle-1');
    expect(withOmitted.status).toBe(200);
    expect(mockedAssignDriver).toHaveBeenLastCalledWith('vehicle-1', null, TENANT, USER_ID);

    // Clearing never looks the driver up.
    expect(mockedDriverFindById).not.toHaveBeenCalled();
  });
});

describe('VehicleController.assignVehicleDriver -- invalid vehicle', () => {
  it('returns 404 when the vehicle does not exist (loadInScopeVehicle -> NotFoundError)', async () => {
    mockedGetVehicleById.mockRejectedValue(new NotFoundError('Vehicle not found'));

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: 'driver-1' }),
      'does-not-exist'
    );

    expect(response.status).toBe(404);
    expect(mockedAssignDriver).not.toHaveBeenCalled();
  });

  it('CROSS-TENANT: a vehicleId belonging to another tenant is not found, never reaching assignDriver', async () => {
    // getVehicleById is itself tenant-scoped (GetVehicleByIdHandler);
    // simulate that contract the same way vehicle-identity-resolver.spec
    // does for the repository layer one level down.
    mockedGetVehicleById.mockRejectedValue(new NotFoundError('Vehicle not found'));

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: 'driver-1' }),
      'vehicle-1'
    );

    expect(response.status).toBe(404);
    expect(mockedAssignDriver).not.toHaveBeenCalled();
  });
});

describe('VehicleController.assignVehicleDriver -- cross-org-unit rejection', () => {
  it('CROSS-ORG-UNIT VEHICLE: a caller scoped to Harare cannot assign a driver on a Bulawayo vehicle (404, not 403)', async () => {
    mockedGetVehicleById.mockResolvedValue(makeVehicle({ orgUnitId: BULAWAYO_BRANCH }));
    mockedResolveContext.mockResolvedValue(makeTenantContext([HARARE_BRANCH]));

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: 'driver-1' }),
      'vehicle-1'
    );

    expect(response.status).toBe(404);
    // Never even gets to look up the driver -- the vehicle-scope check
    // in loadInScopeVehicle fails first.
    expect(mockedDriverFindById).not.toHaveBeenCalled();
    expect(mockedAssignDriver).not.toHaveBeenCalled();
  });

  it('CROSS-ORG-UNIT DRIVER: a caller scoped to Harare cannot assign a Bulawayo driver to their own Harare vehicle', async () => {
    mockedGetVehicleById.mockResolvedValue(makeVehicle({ orgUnitId: HARARE_BRANCH }));
    mockedResolveContext.mockResolvedValue(makeTenantContext([HARARE_BRANCH]));
    mockedDriverFindById.mockResolvedValue(makeDriver({ orgUnitId: BULAWAYO_BRANCH }));

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: 'driver-1' }),
      'vehicle-1'
    );

    expect(response.status).toBe(404);
    expect(mockedAssignDriver).not.toHaveBeenCalled();
  });

  it('an org-wide caller (accessibleOrgUnitIds: null) may assign across branches', async () => {
    mockedGetVehicleById.mockResolvedValue(makeVehicle({ orgUnitId: BULAWAYO_BRANCH }));
    mockedResolveContext.mockResolvedValue(makeTenantContext(null));
    mockedDriverFindById.mockResolvedValue(makeDriver({ orgUnitId: BULAWAYO_BRANCH }));
    mockedAssignDriver.mockResolvedValue(makeVehicle({ currentDriverId: 'driver-1' }));

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: 'driver-1' }),
      'vehicle-1'
    );

    expect(response.status).toBe(200);
    expect(mockedAssignDriver).toHaveBeenCalledWith('vehicle-1', 'driver-1', TENANT, USER_ID);
  });

  it('a driver with no orgUnitId assigned can still be assigned by a scoped caller (only an explicit mismatch is blocked)', async () => {
    mockedGetVehicleById.mockResolvedValue(makeVehicle({ orgUnitId: HARARE_BRANCH }));
    mockedResolveContext.mockResolvedValue(makeTenantContext([HARARE_BRANCH]));
    mockedDriverFindById.mockResolvedValue(makeDriver({ orgUnitId: undefined }));
    mockedAssignDriver.mockResolvedValue(makeVehicle({ currentDriverId: 'driver-1' }));

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: 'driver-1' }),
      'vehicle-1'
    );

    expect(response.status).toBe(200);
  });
});

describe('VehicleController.assignVehicleDriver -- invalid driver, 400/404 consistency', () => {
  it('a well-formed but nonexistent driverId returns 404', async () => {
    mockedGetVehicleById.mockResolvedValue(makeVehicle());
    mockedDriverFindById.mockResolvedValue(null);

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: 'ghost-driver' }),
      'vehicle-1'
    );

    expect(response.status).toBe(404);
    expect(mockedAssignDriver).not.toHaveBeenCalled();
  });

  it('CROSS-TENANT DRIVER: a driverId belonging to another tenant returns 404, same as a nonexistent one', async () => {
    mockedGetVehicleById.mockResolvedValue(makeVehicle());
    // DriverRepository.findById is itself tenant-scoped -- a driver that
    // exists under a different tenant resolves to null here.
    mockedDriverFindById.mockImplementation(async (_id: string, tenantId: string) =>
      tenantId === OTHER_TENANT ? makeDriver() : null
    );

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: 'driver-1' }),
      'vehicle-1'
    );

    expect(response.status).toBe(404);
    expect(mockedDriverFindById).toHaveBeenCalledWith('driver-1', TENANT);
  });

  it('a malformed driverId (not a string or null) returns 400, distinct from the 404 cases above', async () => {
    mockedGetVehicleById.mockResolvedValue(makeVehicle());

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: 12345 }),
      'vehicle-1'
    );

    expect(response.status).toBe(400);
    expect(mockedDriverFindById).not.toHaveBeenCalled();
    expect(mockedAssignDriver).not.toHaveBeenCalled();
  });

  it('an all-whitespace driverId is treated as clearing the driver, not as invalid', async () => {
    mockedGetVehicleById.mockResolvedValue(makeVehicle({ currentDriverId: 'driver-1' }));
    mockedAssignDriver.mockResolvedValue(makeVehicle({ currentDriverId: null }));

    const response = await controller.assignVehicleDriver(
      makeRequest({ driverId: '   ' }),
      'vehicle-1'
    );

    expect(response.status).toBe(200);
    expect(mockedAssignDriver).toHaveBeenCalledWith('vehicle-1', null, TENANT, USER_ID);
  });
});

describe('VehicleController.assignVehicleDriver -- unauthorized (Permission.DRIVER_ASSIGN)', () => {
  // The controller method itself does not re-check the permission --
  // that is withAuth's job (server/middleware/with-auth.ts), which runs
  // BEFORE the controller is ever invoked and returns 403 without
  // calling it. These two assertions cover both halves of that
  // contract: that hasPermission (the exact check withAuth performs)
  // correctly gates DRIVER_ASSIGN, and that the route file actually
  // wires DRIVER_ASSIGN through to withAuth so the gate is in place at
  // all.

  it('hasPermission denies a context without Permission.DRIVER_ASSIGN', () => {
    const context = makeAuthContext({ permissions: [], roles: ['driver'] });
    expect(hasPermission(context, Permission.DRIVER_ASSIGN)).toBe(false);
  });

  it('hasPermission allows a context with Permission.DRIVER_ASSIGN', () => {
    const context = makeAuthContext({ permissions: [Permission.DRIVER_ASSIGN] });
    expect(hasPermission(context, Permission.DRIVER_ASSIGN)).toBe(true);
  });

  it('the driver route requires Permission.DRIVER_ASSIGN via withAuth', () => {
    const routePath = path.resolve(__dirname, '../../app/api/vehicles/[id]/driver/route.ts');
    const source = fs.readFileSync(routePath, 'utf8');

    expect(source).toMatch(/withAuth/);
    expect(source).toMatch(/Permission\.DRIVER_ASSIGN/);
  });
});
