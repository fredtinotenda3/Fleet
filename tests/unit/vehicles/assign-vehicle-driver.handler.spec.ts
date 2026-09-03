// tests/unit/vehicles/assign-vehicle-driver.handler.spec.ts
//
// Unit tests for AssignVehicleDriverHandler
// (modules/vehicles/commands/handlers/assign-vehicle-driver.handler.ts),
// the write side of PATCH /api/vehicles/:id/driver. Mocks
// VehicleRepository and DriverRepository at the boundary the handler
// actually calls, and EventBusFactory so no real bus/audit pipeline is
// touched -- mirrors the mocking style of
// tests/security/vehicle-identity-resolver.spec.ts.
//
// Covers:
//  - authorized assignment succeeds (assign + change)
//  - clearing a driver succeeds
//  - invalid vehicle -> 404 (NotFoundError)
//  - invalid driver -> 404 (NotFoundError), same shape as invalid vehicle
//  - cross-tenant assignment is rejected (findById's own tenant filter
//    returning null is exactly what "cross-tenant" looks like from the
//    handler's point of view -- see the class comment on
//    AssignVehicleDriverCommand for why org-unit scope isn't re-checked
//    here)
//  - the "one vehicle per driver" business rule: reassigning a driver
//    who already holds another vehicle clears that other vehicle in the
//    same command execution
//  - a no-op clear (already unassigned) doesn't publish a spurious
//    unassigned event

import { AssignVehicleDriverHandler } from '../../../modules/vehicles/commands/handlers/assign-vehicle-driver.handler';
import { AssignVehicleDriverCommand } from '../../../modules/vehicles/commands/assign-vehicle-driver.command';
import { NotFoundError } from '../../../server/errors/app.errors';
import { Vehicle } from '../../../shared/types/vehicle.types';
import { Driver } from '../../../shared/types/driver.types';

const mockPublish = jest.fn();

jest.mock('../../../server/events/bus/EventBusFactory', () => ({
  EventBusFactory: {
    getInstance: () => ({ publish: mockPublish }),
  },
}));

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const USER_ID = 'user-1';

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    _id: 'vehicle-1',
    tenantId: TENANT,
    license_plate: 'HRE1234',
    make: 'Toyota',
    model: 'Hilux',
    year: 2020,
    vehicle_type: 'truck',
    purchase_date: '2020-01-01',
    fuel_type: 'diesel',
    status: 'active',
    currentDriverId: null,
    ...overrides,
  } as Vehicle;
}

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    _id: 'driver-1',
    tenantId: TENANT,
    name: 'Tendai Moyo',
    status: 'active',
    ...overrides,
  } as Driver;
}

function makeVehicleRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findById: jest.fn(),
    update: jest.fn(),
    findByCurrentDriver: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as any;
}

function makeDriverRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findById: jest.fn(),
    ...overrides,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AssignVehicleDriverHandler -- assignment', () => {
  it('authorized assignment succeeds: sets currentDriverId and returns the updated vehicle', async () => {
    const vehicle = makeVehicle({ currentDriverId: null });
    const driver = makeDriver();
    const updated = makeVehicle({ currentDriverId: 'driver-1' });

    const vehicleRepo = makeVehicleRepo({
      findById: jest.fn().mockResolvedValue(vehicle),
      update: jest.fn().mockResolvedValue(updated),
    });
    const driverRepo = makeDriverRepo({
      findById: jest.fn().mockResolvedValue(driver),
    });

    const handler = new AssignVehicleDriverHandler(vehicleRepo, driverRepo);
    const result = await handler.execute(
      new AssignVehicleDriverCommand('vehicle-1', 'driver-1', TENANT, USER_ID)
    );

    expect(result).toEqual(updated);
    expect(vehicleRepo.update).toHaveBeenCalledWith(
      'vehicle-1',
      { currentDriverId: 'driver-1' },
      TENANT,
      USER_ID
    );
    // VehicleUpdatedEvent + VehicleDriverAssignedEvent
    expect(mockPublish).toHaveBeenCalledTimes(2);
  });

  it('changing a driver (vehicle already has one) succeeds', async () => {
    const vehicle = makeVehicle({ currentDriverId: 'driver-old' });
    const driver = makeDriver({ _id: 'driver-new' });
    const updated = makeVehicle({ currentDriverId: 'driver-new' });

    const vehicleRepo = makeVehicleRepo({
      findById: jest.fn().mockResolvedValue(vehicle),
      update: jest.fn().mockResolvedValue(updated),
    });
    const driverRepo = makeDriverRepo({
      findById: jest.fn().mockResolvedValue(driver),
    });

    const handler = new AssignVehicleDriverHandler(vehicleRepo, driverRepo);
    const result = await handler.execute(
      new AssignVehicleDriverCommand('vehicle-1', 'driver-new', TENANT, USER_ID)
    );

    expect(result.currentDriverId).toBe('driver-new');
    expect(vehicleRepo.update).toHaveBeenCalledWith(
      'vehicle-1',
      { currentDriverId: 'driver-new' },
      TENANT,
      USER_ID
    );
  });

  it('clearing a driver succeeds (driverId: null)', async () => {
    const vehicle = makeVehicle({ currentDriverId: 'driver-1' });
    const cleared = makeVehicle({ currentDriverId: null });

    const vehicleRepo = makeVehicleRepo({
      findById: jest.fn().mockResolvedValue(vehicle),
      update: jest.fn().mockResolvedValue(cleared),
    });
    const driverRepo = makeDriverRepo();

    const handler = new AssignVehicleDriverHandler(vehicleRepo, driverRepo);
    const result = await handler.execute(
      new AssignVehicleDriverCommand('vehicle-1', null, TENANT, USER_ID)
    );

    expect(result.currentDriverId).toBeNull();
    expect(vehicleRepo.update).toHaveBeenCalledWith(
      'vehicle-1',
      { currentDriverId: null },
      TENANT,
      USER_ID
    );
    // Driver lookup is never called when clearing.
    expect(driverRepo.findById).not.toHaveBeenCalled();
    // VehicleUpdatedEvent + VehicleDriverUnassignedEvent
    expect(mockPublish).toHaveBeenCalledTimes(2);
  });

  it('clearing an already-unassigned vehicle is a no-op that does not publish a spurious unassigned event', async () => {
    const vehicle = makeVehicle({ currentDriverId: null });
    const stillCleared = makeVehicle({ currentDriverId: null });

    const vehicleRepo = makeVehicleRepo({
      findById: jest.fn().mockResolvedValue(vehicle),
      update: jest.fn().mockResolvedValue(stillCleared),
    });
    const driverRepo = makeDriverRepo();

    const handler = new AssignVehicleDriverHandler(vehicleRepo, driverRepo);
    await handler.execute(new AssignVehicleDriverCommand('vehicle-1', null, TENANT, USER_ID));

    // Only VehicleUpdatedEvent -- no VehicleDriverUnassignedEvent, since
    // there was no previous driver to clear.
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });
});

describe('AssignVehicleDriverHandler -- not-found / cross-tenant behaviour', () => {
  it('invalid vehicle returns NotFoundError (maps to 404)', async () => {
    const vehicleRepo = makeVehicleRepo({ findById: jest.fn().mockResolvedValue(null) });
    const driverRepo = makeDriverRepo();

    const handler = new AssignVehicleDriverHandler(vehicleRepo, driverRepo);

    await expect(
      handler.execute(new AssignVehicleDriverCommand('does-not-exist', 'driver-1', TENANT, USER_ID))
    ).rejects.toThrow(NotFoundError);

    // Never reaches driver validation or the write.
    expect(driverRepo.findById).not.toHaveBeenCalled();
    expect(vehicleRepo.update).not.toHaveBeenCalled();
  });

  it('invalid driver returns NotFoundError (maps to 404), consistent with the invalid-vehicle case', async () => {
    const vehicle = makeVehicle();
    const vehicleRepo = makeVehicleRepo({
      findById: jest.fn().mockResolvedValue(vehicle),
    });
    const driverRepo = makeDriverRepo({ findById: jest.fn().mockResolvedValue(null) });

    const handler = new AssignVehicleDriverHandler(vehicleRepo, driverRepo);

    await expect(
      handler.execute(new AssignVehicleDriverCommand('vehicle-1', 'ghost-driver', TENANT, USER_ID))
    ).rejects.toThrow(NotFoundError);

    // Never writes the vehicle when the driver doesn't resolve.
    expect(vehicleRepo.update).not.toHaveBeenCalled();
  });

  it('CROSS-TENANT: a driverId belonging to another tenant is treated as not found, because DriverRepository.findById is itself tenant-scoped', async () => {
    const vehicle = makeVehicle();
    const vehicleRepo = makeVehicleRepo({ findById: jest.fn().mockResolvedValue(vehicle) });
    // Simulate BaseRepository.findById's own tenant filter: a driver
    // that exists but belongs to a different tenant resolves to null
    // when looked up under TENANT.
    const driverRepo = makeDriverRepo({
      findById: jest.fn().mockImplementation(async (_id: string, tenantId: string) =>
        tenantId === TENANT ? null : makeDriver()
      ),
    });

    const handler = new AssignVehicleDriverHandler(vehicleRepo, driverRepo);

    await expect(
      handler.execute(new AssignVehicleDriverCommand('vehicle-1', 'driver-1', TENANT, USER_ID))
    ).rejects.toThrow(NotFoundError);
    expect(driverRepo.findById).toHaveBeenCalledWith('driver-1', TENANT);
  });

  it('CROSS-TENANT: a vehicleId belonging to another tenant is treated as not found, because VehicleRepository.findById is itself tenant-scoped', async () => {
    // Simulate the same contract for the vehicle side.
    const vehicleRepo = makeVehicleRepo({
      findById: jest.fn().mockImplementation(async (_id: string, tenantId: string) =>
        tenantId === TENANT ? null : makeVehicle()
      ),
    });
    const driverRepo = makeDriverRepo();

    const handler = new AssignVehicleDriverHandler(vehicleRepo, driverRepo);

    await expect(
      handler.execute(new AssignVehicleDriverCommand('vehicle-1', 'driver-1', TENANT, USER_ID))
    ).rejects.toThrow(NotFoundError);
    expect(vehicleRepo.findById).toHaveBeenCalledWith('vehicle-1', TENANT);
  });
});

describe('AssignVehicleDriverHandler -- one vehicle per driver business rule', () => {
  it('unassigns the driver from any OTHER vehicle they currently hold, in the same command execution', async () => {
    const target = makeVehicle({ _id: 'vehicle-target', currentDriverId: null });
    const other = makeVehicle({ _id: 'vehicle-other', currentDriverId: 'driver-1' });
    const driver = makeDriver({ _id: 'driver-1' });

    const updatedTarget = makeVehicle({ _id: 'vehicle-target', currentDriverId: 'driver-1' });
    const clearedOther = makeVehicle({ _id: 'vehicle-other', currentDriverId: null });

    const vehicleRepo = makeVehicleRepo({
      findById: jest.fn().mockResolvedValue(target),
      findByCurrentDriver: jest.fn().mockResolvedValue([other]),
      update: jest
        .fn()
        .mockImplementation(async (id: string) =>
          id === 'vehicle-other' ? clearedOther : updatedTarget
        ),
    });
    const driverRepo = makeDriverRepo({ findById: jest.fn().mockResolvedValue(driver) });

    const handler = new AssignVehicleDriverHandler(vehicleRepo, driverRepo);
    const result = await handler.execute(
      new AssignVehicleDriverCommand('vehicle-target', 'driver-1', TENANT, USER_ID)
    );

    // The other vehicle was looked up excluding the target, and cleared.
    expect(vehicleRepo.findByCurrentDriver).toHaveBeenCalledWith(
      'driver-1',
      TENANT,
      'vehicle-target'
    );
    expect(vehicleRepo.update).toHaveBeenCalledWith(
      'vehicle-other',
      { currentDriverId: null },
      TENANT,
      USER_ID
    );
    expect(vehicleRepo.update).toHaveBeenCalledWith(
      'vehicle-target',
      { currentDriverId: 'driver-1' },
      TENANT,
      USER_ID
    );
    expect(result).toEqual(updatedTarget);

    // 2 events for the cleared "other" vehicle + 2 for the target.
    expect(mockPublish).toHaveBeenCalledTimes(4);
  });

  it('does not look up other vehicles at all when clearing a driver', async () => {
    const vehicle = makeVehicle({ currentDriverId: 'driver-1' });
    const vehicleRepo = makeVehicleRepo({
      findById: jest.fn().mockResolvedValue(vehicle),
      update: jest.fn().mockResolvedValue(makeVehicle({ currentDriverId: null })),
    });
    const driverRepo = makeDriverRepo();

    const handler = new AssignVehicleDriverHandler(vehicleRepo, driverRepo);
    await handler.execute(new AssignVehicleDriverCommand('vehicle-1', null, TENANT, USER_ID));

    expect(vehicleRepo.findByCurrentDriver).not.toHaveBeenCalled();
  });
});
