// tests/security/telematics-ingest-authorization.spec.ts
//
// PHASE 0, F-5 regression suite.
//
// THE VULNERABILITY: POST /api/telematics/ingest resolved a tenantId
// from the session and then wrote whatever it was given. No permission.
// No check that `vehicleId` belonged to the caller's org unit -- or to
// any vehicle at all. No `orgUnitId` on the written row.
//
// So any authenticated user could assert arbitrary position, speed,
// odometer and fuel level against ANY vehicle in the tenant. That
// corrupts the digital twin, fires geofence and speeding alerts, writes
// a false GPS trace into a vehicle's history, and (once finance posts
// telemetry-driven costs) corrupts the ledger. Writing with no
// orgUnitId also made the corruption INVISIBLE to scoped readers.
//
// Note that middleware.ts does NOT cover /api/telematics/* -- its
// matcher excludes non-versioned /api/* -- so the route wrapper is the
// only protection and the structural test below is load-bearing.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const mockVehicleRepo = { findById: jest.fn() };
const mockTelematicsRepo = { getDevice: jest.fn() };
const mockService = { ingestTelematicsData: jest.fn() };
const mockResolveContext = jest.fn();

jest.mock('@/modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: mockVehicleRepo,
}));
jest.mock('@/modules/telematics/repositories/telematics.repository', () => ({
  telematicsRepository: mockTelematicsRepo,
}));
jest.mock('@/modules/telematics/services/telematics.service', () => ({
  telematicsService: mockService,
}));
jest.mock('@/server/utils/tenant-context.utils', () => ({
  resolveTenantContext: (...args: unknown[]) => mockResolveContext(...args),
}));
// The controller's other imports reach getAuthContext -> jose, which is
// ESM and not transformed by this Jest config. The authentication
// decision is not what this suite is about -- it is asserted
// structurally at the bottom (the route requires TELEMATICS_INGEST via
// withAuth) -- so the boundary is stubbed here.
jest.mock('@/server/utils/context.utils', () => ({
  getTenantFromRequest: jest.fn(async () => 'tenant-a'),
  getUserIdFromRequest: jest.fn(async () => 'user-1'),
  getUserRolesFromRequest: jest.fn(async () => ['viewer']),
  isSuperAdmin: jest.fn(async () => false),
}));

import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';
import { telematicsIngestSchema } from '@/shared/validations/telematics.schema';
import { Permission, rolePermissions, Role } from '@/server/permissions/roles';

const TENANT = 'tenant-a';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: 'device-1',
    vehicleId: 'vehicle-1',
    location: {
      lat: -17.82,
      lng: 31.05,
      speed: 42,
      heading: 90,
      altitude: 1480,
      accuracy: 5,
      timestamp: new Date().toISOString(),
    },
    engine: { fuelLevel: 55 },
    trip: { odometer: 120_000 },
    fuel: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function requestWith(body: unknown) {
  return { json: async () => body } as never;
}

function scopedContext(accessibleOrgUnitIds: string[] | null) {
  return {
    organizationId: TENANT,
    organizationName: 'Tenant A',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  };
}

async function statusOf(response: unknown): Promise<number> {
  return (response as { status: number }).status;
}

describe('F-5: telemetry ingestion resolves ownership authoritatively', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveContext.mockResolvedValue(scopedContext(['unit-harare']));
    mockTelematicsRepo.getDevice.mockResolvedValue(null);
    mockService.ingestTelematicsData.mockResolvedValue(undefined);
  });

  it('writes the orgUnitId taken from the VEHICLE, not the request', async () => {
    mockVehicleRepo.findById.mockResolvedValue({
      _id: 'vehicle-1',
      license_plate: 'ADY2531',
      orgUnitId: 'unit-harare',
    });

    await telematicsController.ingest(requestWith(validPayload()));

    expect(mockService.ingestTelematicsData).toHaveBeenCalledTimes(1);
    const written = mockService.ingestTelematicsData.mock.calls[0][0];
    expect(written.orgUnitId).toBe('unit-harare');
    expect(written.tenantId).toBe(TENANT);
    expect(written.vehicleId).toBe('vehicle-1');
  });

  it('REJECTS a body carrying a forged orgUnitId', async () => {
    mockVehicleRepo.findById.mockResolvedValue({
      _id: 'vehicle-1',
      license_plate: 'ADY2531',
      orgUnitId: 'unit-harare',
    });

    const response = await telematicsController.ingest(
      requestWith(validPayload({ orgUnitId: 'unit-bulawayo' }))
    );

    // .strict() turns a forged ownership key into a 400 rather than
    // relying on spread order staying correct forever.
    expect(await statusOf(response)).toBe(400);
    expect(mockService.ingestTelematicsData).not.toHaveBeenCalled();
  });

  it('REJECTS a body carrying a forged tenantId', async () => {
    mockVehicleRepo.findById.mockResolvedValue({
      _id: 'vehicle-1',
      license_plate: 'ADY2531',
      orgUnitId: 'unit-harare',
    });

    const response = await telematicsController.ingest(
      requestWith(validPayload({ tenantId: 'tenant-b' }))
    );

    expect(await statusOf(response)).toBe(400);
    expect(mockService.ingestTelematicsData).not.toHaveBeenCalled();
  });

  it('REJECTS a vehicle outside the caller org units (the headline bug)', async () => {
    // The vehicle exists in the tenant but belongs to another branch.
    mockVehicleRepo.findById.mockResolvedValue({
      _id: 'vehicle-2',
      license_plate: 'AFU0078',
      orgUnitId: 'unit-bulawayo',
    });

    const response = await telematicsController.ingest(
      requestWith(validPayload({ vehicleId: 'vehicle-2' }))
    );

    // 404 not 403: a 403 confirms the vehicle exists, which tells a
    // caller probing ids something about another branch's fleet.
    expect(await statusOf(response)).toBe(404);
    expect(mockService.ingestTelematicsData).not.toHaveBeenCalled();
  });

  it('REJECTS a vehicle in another tenant', async () => {
    // findById is tenant-scoped, so a cross-tenant id resolves to null.
    mockVehicleRepo.findById.mockResolvedValue(null);

    const response = await telematicsController.ingest(
      requestWith(validPayload({ vehicleId: 'vehicle-in-tenant-b' }))
    );

    expect(await statusOf(response)).toBe(404);
    expect(mockVehicleRepo.findById).toHaveBeenCalledWith('vehicle-in-tenant-b', TENANT);
    expect(mockService.ingestTelematicsData).not.toHaveBeenCalled();
  });

  it('REJECTS a deleted vehicle', async () => {
    // findById applies getActiveFilter, so a soft-deleted row is null.
    mockVehicleRepo.findById.mockResolvedValue(null);

    const response = await telematicsController.ingest(requestWith(validPayload()));

    expect(await statusOf(response)).toBe(404);
    expect(mockService.ingestTelematicsData).not.toHaveBeenCalled();
  });

  it('REJECTS an unassigned vehicle for a scoped caller (fails closed)', async () => {
    mockVehicleRepo.findById.mockResolvedValue({
      _id: 'vehicle-3',
      license_plate: 'ADL5345',
      // no orgUnitId
    });

    const response = await telematicsController.ingest(
      requestWith(validPayload({ vehicleId: 'vehicle-3' }))
    );

    expect(await statusOf(response)).toBe(404);
    expect(mockService.ingestTelematicsData).not.toHaveBeenCalled();
  });

  it('REJECTS a device already registered to a different vehicle', async () => {
    mockVehicleRepo.findById.mockResolvedValue({
      _id: 'vehicle-1',
      license_plate: 'ADY2531',
      orgUnitId: 'unit-harare',
    });
    mockTelematicsRepo.getDevice.mockResolvedValue({
      deviceId: 'device-1',
      vehicleId: 'vehicle-99',
    });

    const response = await telematicsController.ingest(requestWith(validPayload()));

    expect(await statusOf(response)).toBe(409);
    expect(mockService.ingestTelematicsData).not.toHaveBeenCalled();
  });

  it('allows an org-wide caller (accessibleOrgUnitIds === null)', async () => {
    mockResolveContext.mockResolvedValue(scopedContext(null));
    mockVehicleRepo.findById.mockResolvedValue({
      _id: 'vehicle-2',
      license_plate: 'AFU0078',
      orgUnitId: 'unit-bulawayo',
    });

    await telematicsController.ingest(
      requestWith(validPayload({ vehicleId: 'vehicle-2' }))
    );

    expect(mockService.ingestTelematicsData).toHaveBeenCalledTimes(1);
    expect(mockService.ingestTelematicsData.mock.calls[0][0].orgUnitId).toBe(
      'unit-bulawayo'
    );
  });
});

describe('F-5: absent measurements stay absent', () => {
  it('does not fabricate zeros for omitted engine/trip/fuel fields', () => {
    // The schema previously REQUIRED every measurement, which did not
    // prevent fabrication -- it mandated it: a device with no RPM sensor
    // had to send `rpm: 0`. A fabricated fuelLevel: 0 reaches
    // checkForAlerts' `< 10` branch and manufactures a high-severity
    // alert plus a manager notification on every post; a fabricated
    // odometer: 0 wins over the vehicle's real odometer in
    // digital-twin's fallback chain.
    const parsed = telematicsIngestSchema.parse({
      deviceId: 'd',
      vehicleId: 'v',
      engine: {},
      trip: {},
      fuel: {},
      timestamp: new Date().toISOString(),
    });

    expect(parsed.engine.fuelLevel).toBeUndefined();
    expect(parsed.engine.rpm).toBeUndefined();
    expect(parsed.trip.odometer).toBeUndefined();
    expect(parsed.fuel.fuelUsed).toBeUndefined();

    // Specifically NOT zero.
    expect(parsed.engine.fuelLevel).not.toBe(0);
    expect(parsed.trip.odometer).not.toBe(0);
  });

  it('still accepts a genuine zero as a real measurement', () => {
    const parsed = telematicsIngestSchema.parse({
      deviceId: 'd',
      vehicleId: 'v',
      engine: { fuelLevel: 0 },
      trip: {},
      fuel: {},
      timestamp: new Date().toISOString(),
    });
    expect(parsed.engine.fuelLevel).toBe(0);
  });
});

describe('F-5: payload validation bounds', () => {
  const base = {
    deviceId: 'd',
    vehicleId: 'v',
    engine: {},
    trip: {},
    fuel: {},
  };

  it('rejects a far-future timestamp', () => {
    // An unbounded coerce.date() accepts the year 9999, which would
    // park a reading permanently at the head of every timestamp:-1
    // index and defeat every "is this newer than what I hold" guard.
    const result = telematicsIngestSchema.safeParse({
      ...base,
      timestamp: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an implausibly old timestamp', () => {
    const result = telematicsIngestSchema.safeParse({
      ...base,
      timestamp: '1999-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a buffered reading from a few days ago', () => {
    // Devices legitimately buffer while out of coverage and dump on
    // reconnect; a narrow "must be recent" rule would discard exactly
    // the data that matters.
    const result = telematicsIngestSchema.safeParse({
      ...base,
      timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects out-of-range coordinates and speeds', () => {
    expect(
      telematicsIngestSchema.safeParse({
        ...base,
        timestamp: new Date().toISOString(),
        location: {
          lat: 200,
          lng: 31,
          speed: 10,
          altitude: 0,
          accuracy: 1,
          timestamp: new Date().toISOString(),
        },
      }).success
    ).toBe(false);

    expect(
      telematicsIngestSchema.safeParse({
        ...base,
        timestamp: new Date().toISOString(),
        location: {
          lat: -17,
          lng: 31,
          speed: 99999,
          altitude: 0,
          accuracy: 1,
          timestamp: new Date().toISOString(),
        },
      }).success
    ).toBe(false);
  });

  it('rejects unknown keys anywhere in the payload', () => {
    expect(
      telematicsIngestSchema.safeParse({
        ...base,
        timestamp: new Date().toISOString(),
        isDeleted: false,
      }).success
    ).toBe(false);
  });
});

describe('F-5: the route is permission-gated', () => {
  it('requires TELEMATICS_INGEST via withAuth', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'app/api/telematics/ingest/route.ts'),
      'utf8'
    );
    expect(src).toContain('withAuth');
    expect(src).toContain('Permission.TELEMATICS_INGEST');
  });

  it('is not a bare exported POST handler', () => {
    const code = fs
      .readFileSync(path.join(ROOT, 'app/api/telematics/ingest/route.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/export\s+async\s+function\s+POST/);
  });

  it('grants TELEMATICS_INGEST to no ordinary role', () => {
    // Asserting a measurement into the telemetry stream is a MACHINE
    // act. The intended credential is a service identity, not a human
    // login -- which is also why this is not folded into VEHICLE_EDIT.
    const humanRoles = [
      Role.BRANCH_MANAGER,
      Role.DEPARTMENT_MANAGER,
      Role.FLEET_MANAGER,
      Role.WORKSHOP_MANAGER,
      Role.SUPERVISOR,
      Role.ACCOUNTANT,
      Role.DISPATCHER,
      Role.DRIVER,
      Role.MECHANIC,
      Role.AUDITOR,
      Role.VIEWER,
    ];
    for (const role of humanRoles) {
      expect(rolePermissions[role]).not.toContain(Permission.TELEMATICS_INGEST);
    }
  });
});
