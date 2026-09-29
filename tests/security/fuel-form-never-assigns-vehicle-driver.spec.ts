// tests/security/fuel-form-never-assigns-vehicle-driver.spec.ts
//
// PART 2 ("Driver assignment must only happen on the Vehicle Operational
// Hub. The Fuel form must NOT be responsible for assigning the vehicle's
// driver.").
//
// INVESTIGATION FINDING, not a bug fix: the Fuel form's driver_id field
// was already, by design, transaction-time attribution on the FuelLog
// itself (see shared/types/fuel.types.ts's doc comment: "NOT the
// vehicle's current driver. A fuel log records who fuelled the vehicle
// on that date; back-filling the vehicle's present driver onto
// historical logs would rewrite one person's fuel spend onto another.")
// -- it has never written Vehicle.currentDriverId. The ONLY writer of
// that field is AssignVehicleDriverHandler
// (modules/vehicles/commands/handlers/assign-vehicle-driver.handler.ts),
// reached exclusively through PATCH /api/vehicles/:id/driver, which the
// Vehicle Operational Hub's DriverAssignmentPanel
// (frontend/modules/vehicles/components/DriverAssignmentPanel.tsx,
// embedded in VehicleDetailPage.tsx) is the only UI caller of.
//
// This file exists to make that separation a hard, enforced invariant
// rather than an implicit property of the current code -- so a future
// change that adds a "convenience" vehicle-driver write to the fuel path
// (e.g. "auto-assign this driver to the vehicle since they just fuelled
// it") fails a test instead of silently reintroducing a second
// assignment mechanism, which PART 2 explicitly forbids ("Do NOT
// introduce a second competing driver-assignment mechanism.").
//
// Approach: spy on VehicleRepository.prototype.update -- the one method
// AssignVehicleDriverHandler calls to write currentDriverId (see that
// handler's own source, lines ~75 and ~106) -- and assert it is NEVER
// invoked while creating or updating a fuel log, however the fuel log's
// own driver_id is set.

import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import { userWriteScope } from '../../server/tenancy/write-scope';
import { VehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const HARARE = 'branch-harare';
const HARARE_DRIVER = '68b1f2c4d1e2a30011111111';

function scopedContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: ORG,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as TenantContext;
}

const orgAdmin = scopedContext(null);

const fuelCreate = jest.fn();
const fuelUpdate = jest.fn();

jest.mock('../../modules/vehicles/services/vehicle-identity-resolver.service', () => ({
  vehicleIdentityResolver: { resolveByPlate: jest.fn() },
}));
jest.mock('../../modules/drivers/repositories/driver.repository', () => ({
  driverRepository: { findById: jest.fn() },
  DriverRepository: class {},
}));
jest.mock('../../infrastructure/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../../server/events/bus/EventBusFactory', () => ({
  EventBusFactory: { getInstance: () => ({ publish: jest.fn().mockResolvedValue(undefined) }) },
}));

import { vehicleIdentityResolver } from '../../modules/vehicles/services/vehicle-identity-resolver.service';
import { driverRepository } from '../../modules/drivers/repositories/driver.repository';
import connectToDatabase from '../../infrastructure/database/mongodb';
import { CreateFuelLogHandler } from '../../modules/fuel/commands/handlers/create-fuel-log.handler';
import { CreateFuelLogCommand } from '../../modules/fuel/commands/create-fuel-log.command';
import { UpdateFuelLogHandler } from '../../modules/fuel/commands/handlers/update-fuel-log.handler';
import { UpdateFuelLogCommand } from '../../modules/fuel/commands/update-fuel-log.command';

const resolveByPlate = vehicleIdentityResolver.resolveByPlate as jest.Mock;
const findDriverById = driverRepository.findById as jest.Mock;
const connect = connectToDatabase as unknown as jest.Mock;

const AFU0078 = {
  _id: '68b1f2c4d1e2a30099999999',
  license_plate: 'AFU0078',
  orgUnitId: HARARE,
  tenantId: ORG,
  currentDriverId: null, // no vehicle assignment yet -- set only via the Vehicle Hub
};

const DRIVERS: Record<string, Record<string, unknown>> = {
  [HARARE_DRIVER]: { _id: HARARE_DRIVER, name: 'Tendai Moyo', orgUnitId: HARARE, tenantId: ORG },
};

let vehicleRepoUpdateSpy: jest.SpyInstance;

beforeEach(() => {
  fuelCreate.mockReset();
  fuelUpdate.mockReset();
  resolveByPlate.mockReset();
  findDriverById.mockReset();
  connect.mockReset();

  fuelCreate.mockImplementation((doc: Record<string, unknown>) => ({ _id: 'fuel-new', ...doc }));
  fuelUpdate.mockImplementation((_id: string, doc: Record<string, unknown>) => ({
    _id,
    license_plate: 'AFU0078',
    ...doc,
  }));
  resolveByPlate.mockResolvedValue({ status: 'found', vehicle: AFU0078 });
  findDriverById.mockImplementation(async (id: string) => DRIVERS[id] ?? null);
  connect.mockResolvedValue({
    collection: (name: string) => ({
      findOne: async () => (name === 'tblunits' ? { unit_id: 'L', type: 'volume' } : null),
    }),
  });

  // The one method AssignVehicleDriverHandler uses to write
  // Vehicle.currentDriverId. Spied (not mocked-away) so a genuine call
  // would still execute against whatever real implementation exists in
  // this test environment -- the assertion is purely "was it called".
  vehicleRepoUpdateSpy = jest.spyOn(VehicleRepository.prototype, 'update').mockResolvedValue(null as never);
});

afterEach(() => {
  vehicleRepoUpdateSpy.mockRestore();
});

const fuelRepoStub = { create: fuelCreate, update: fuelUpdate } as never;

describe('Fuel form never assigns the vehicle\'s driver (PART 2 invariant)', () => {
  it('creating a fuel log WITH a driver never calls VehicleRepository.update', async () => {
    const handler = new CreateFuelLogHandler(fuelRepoStub);
    await handler.execute(
      new CreateFuelLogCommand(
        {
          license_plate: 'AFU0078',
          date: '2026-09-01',
          fuel_volume: 50,
          unit_id: 'L',
          cost: 100,
          payment_method: 'cash',
          driver_id: HARARE_DRIVER,
        },
        ORG,
        userWriteScope(orgAdmin),
        'user-1'
      )
    );

    expect(fuelCreate).toHaveBeenCalledTimes(1);
    // The fuel log itself carries the driver (transaction-time
    // attribution) -- that is expected and correct.
    expect((fuelCreate.mock.calls[0][0] as Record<string, unknown>).driver_id).toBe(HARARE_DRIVER);
    // But the VEHICLE's own assignment is untouched. This is the actual
    // PART 2 assertion.
    expect(vehicleRepoUpdateSpy).not.toHaveBeenCalled();
  });

  it('creating a fuel log WITHOUT a driver never calls VehicleRepository.update', async () => {
    const handler = new CreateFuelLogHandler(fuelRepoStub);
    await handler.execute(
      new CreateFuelLogCommand(
        {
          license_plate: 'AFU0078',
          date: '2026-09-01',
          fuel_volume: 50,
          unit_id: 'L',
          cost: 100,
          payment_method: 'cash',
        },
        ORG,
        userWriteScope(orgAdmin),
        'user-1'
      )
    );

    expect(vehicleRepoUpdateSpy).not.toHaveBeenCalled();
  });

  it('updating a fuel log\'s driver_id never calls VehicleRepository.update', async () => {
    const handler = new UpdateFuelLogHandler(fuelRepoStub);
    await handler.execute(
      new UpdateFuelLogCommand('fuel-1', { driver_id: HARARE_DRIVER }, ORG, userWriteScope(orgAdmin), 'user-1')
    );

    expect(fuelUpdate).toHaveBeenCalledTimes(1);
    expect(vehicleRepoUpdateSpy).not.toHaveBeenCalled();
  });

  it('clearing a fuel log\'s driver_id never calls VehicleRepository.update', async () => {
    const handler = new UpdateFuelLogHandler(fuelRepoStub);
    await handler.execute(
      new UpdateFuelLogCommand('fuel-1', { driver_id: '' }, ORG, userWriteScope(orgAdmin), 'user-1')
    );

    expect(vehicleRepoUpdateSpy).not.toHaveBeenCalled();
  });
});
