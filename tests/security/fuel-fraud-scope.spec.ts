// tests/security/fuel-fraud-scope.spec.ts
//
// Proves fuelFraudDetectionService.detectFraud() is org-unit scoped the
// same way fleetHealthService.calculateHealthScore() and
// driverRiskService.calculateDriverRisk() are: a caller with a narrowed
// TenantContext only sees vehicles assigned to an accessible org unit,
// and only their fuel logs within that scope feed the baseline/anomaly
// analysis.
//
// Mirrors the mocking style of tests/security/driver-risk-scope.spec.ts
// -- mock the repositories at the boundary this service actually calls,
// rather than standing up a real Mongo connection.

import { fuelFraudDetectionService } from '../../modules/ai/services/fuel-fraud-detection.service';
import { vehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import { fuelRepository } from '../../modules/fuel/repositories/fuel.repository';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

jest.mock('../../modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { findMany: jest.fn(), findById: jest.fn() },
}));
jest.mock('../../modules/fuel/repositories/fuel.repository', () => ({
  fuelRepository: { findMany: jest.fn() },
}));

const mockedVehicleFindMany = vehicleRepository.findMany as jest.Mock;
const mockedFuelFindMany = fuelRepository.findMany as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';

const harareVehicle = {
  _id: 'vehicle-harare',
  license_plate: 'HRE1234',
  orgUnitId: HARARE_BRANCH,
};

const bulawayoVehicle = {
  _id: 'vehicle-bulawayo',
  license_plate: 'BYO5678',
  orgUnitId: BULAWAYO_BRANCH,
};

// 10+ logs so buildFraudAlert() doesn't short-circuit on "insufficient
// data" before scoping is even exercised. Values are boring/consistent
// on purpose -- these tests care about which rows reach the analysis,
// not what the analysis concludes.
function makeFuelLogs(licensePlate: string, count = 12) {
  return Array.from({ length: count }, (_, i) => ({
    license_plate: licensePlate,
    fuel_volume: 40,
    cost: 60,
    odometer: 500 * (i + 1),
    date: new Date(2026, 0, i + 1).toISOString(),
  }));
}

function makeScopedContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as TenantContext;
}

describe('fuel-fraud-detection org-unit scoping', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('with no context (org-wide caller), fetches every vehicle unscoped', async () => {
    mockedVehicleFindMany.mockResolvedValue([harareVehicle, bulawayoVehicle]);
    mockedFuelFindMany.mockResolvedValue([
      ...makeFuelLogs(harareVehicle.license_plate),
      ...makeFuelLogs(bulawayoVehicle.license_plate),
    ]);

    const result = await fuelFraudDetectionService.detectFraud(TENANT);

    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    expect(mockedVehicleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ isDeleted: { $ne: true } }),
      TENANT
    );
  });

  it('with a Harare-only context, only the Harare vehicle is fetched', async () => {
    mockedVehicleFindMany.mockResolvedValue([harareVehicle]);
    mockedFuelFindMany.mockResolvedValue(makeFuelLogs(harareVehicle.license_plate));

    const context = makeScopedContext([HARARE_BRANCH]);
    const result = await fuelFraudDetectionService.detectFraud(TENANT, context);

    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
    expect(mockedVehicleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: { $ne: true },
        orgUnitId: { $in: [HARARE_BRANCH] },
      }),
      TENANT
    );
  });

  it('with a Harare-only context, the fuel log query includes the org-unit filter', async () => {
    mockedVehicleFindMany.mockResolvedValue([harareVehicle]);
    mockedFuelFindMany.mockResolvedValue(makeFuelLogs(harareVehicle.license_plate));

    const context = makeScopedContext([HARARE_BRANCH]);
    await fuelFraudDetectionService.detectFraud(TENANT, context);

    expect(mockedFuelFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        license_plate: { $in: [harareVehicle.license_plate] },
        orgUnitId: { $in: [HARARE_BRANCH] },
      }),
      TENANT
    );
  });

  it('a Bulawayo vehicle never reaches the fuel log query for a Harare-only caller', async () => {
    // Simulates the repository actually applying the scope filter it
    // was called with -- only Harare's plate appears in the $in list.
    mockedVehicleFindMany.mockResolvedValue([harareVehicle]);
    mockedFuelFindMany.mockResolvedValue(makeFuelLogs(harareVehicle.license_plate));

    const context = makeScopedContext([HARARE_BRANCH]);
    await fuelFraudDetectionService.detectFraud(TENANT, context);

    const [filterArg] = mockedFuelFindMany.mock.calls[0];
    expect(filterArg.license_plate.$in).not.toContain(bulawayoVehicle.license_plate);
  });

  it('with accessibleOrgUnitIds resolved to an empty array, fails closed (zero vehicles, no fuel query)', async () => {
    mockedVehicleFindMany.mockResolvedValue([]);

    const context = makeScopedContext([]);
    const result = await fuelFraudDetectionService.detectFraud(TENANT, context);

    expect(result.success).toBe(true);
    expect(result.total).toBe(0);
    expect(mockedVehicleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orgUnitId: { $in: [] } }),
      TENANT
    );
    expect(mockedFuelFindMany).not.toHaveBeenCalled();
  });

  describe('detectVehicleFraud (single-vehicle path)', () => {
    it('returns "Vehicle not found" when the vehicle is outside the caller scope', async () => {
      (vehicleRepository.findById as jest.Mock).mockResolvedValue(bulawayoVehicle);

      const context = makeScopedContext([HARARE_BRANCH]);
      const result = await fuelFraudDetectionService.detectVehicleFraud(
        bulawayoVehicle._id,
        TENANT,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Vehicle not found');
      expect(mockedFuelFindMany).not.toHaveBeenCalled();
    });

    it('scopes the fuel log query when the vehicle is inside the caller scope', async () => {
      (vehicleRepository.findById as jest.Mock).mockResolvedValue(harareVehicle);
      mockedFuelFindMany.mockResolvedValue(makeFuelLogs(harareVehicle.license_plate));

      const context = makeScopedContext([HARARE_BRANCH]);
      await fuelFraudDetectionService.detectVehicleFraud(harareVehicle._id, TENANT, context);

      expect(mockedFuelFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          license_plate: harareVehicle.license_plate,
          orgUnitId: { $in: [HARARE_BRANCH] },
        }),
        TENANT,
        { limit: 100 }
      );
    });
  });
});
