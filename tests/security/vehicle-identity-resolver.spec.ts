// tests/security/vehicle-identity-resolver.spec.ts
//
// PHASE 0, ITEM 3: thorough tests for the canonical plate <-> _id
// translation layer. Mirrors the mocking style of
// tests/security/driver-risk-scope.spec.ts -- mock vehicleRepository at
// the boundary the resolver actually calls.

import { VehicleIdentityResolver } from '../../modules/vehicles/services/vehicle-identity-resolver.service';
import { vehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import { Vehicle } from '../../shared/types/vehicle.types';

jest.mock('../../modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: {
    findById: jest.fn(),
    findByLicensePlates: jest.fn(),
  },
}));

const mockedFindById = vehicleRepository.findById as jest.Mock;
const mockedFindByLicensePlates = vehicleRepository.findByLicensePlates as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const OTHER_TENANT = 'another-org-abc123';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    _id: 'vehicle-1',
    tenantId: TENANT,
    licensePlate: 'HRE1234',
    orgUnitId: HARARE_BRANCH,
    isDeleted: false,
    ...overrides,
  } as unknown as Vehicle;
}

function makeContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
  } as TenantContext;
}

const resolver = new VehicleIdentityResolver();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('VehicleIdentityResolver.resolveById', () => {
  it('resolves an existing vehicle by its canonical _id', async () => {
    const vehicle = makeVehicle();
    mockedFindById.mockResolvedValue(vehicle);

    const result = await resolver.resolveById('vehicle-1', TENANT);

    expect(result).toEqual({ status: 'resolved', vehicle });
    expect(mockedFindById).toHaveBeenCalledWith('vehicle-1', TENANT);
  });

  it('fails closed (not_found) for a missing id, never throwing', async () => {
    mockedFindById.mockResolvedValue(null);
    const result = await resolver.resolveById('does-not-exist', TENANT);
    expect(result).toEqual({ status: 'not_found' });
  });

  it('fails closed for a null/undefined/empty id without querying the repository', async () => {
    expect(await resolver.resolveById(null, TENANT)).toEqual({ status: 'not_found' });
    expect(await resolver.resolveById(undefined, TENANT)).toEqual({ status: 'not_found' });
    expect(await resolver.resolveById('', TENANT)).toEqual({ status: 'not_found' });
    expect(mockedFindById).not.toHaveBeenCalled();
  });

  it('never resolves a vehicle belonging to a different tenant (delegated to findById\'s own tenant filter)', async () => {
    // BaseRepository.findById filters by tenantId internally; a vehicle
    // id that exists but belongs to OTHER_TENANT returns null when
    // looked up under TENANT. Simulate that contract here.
    mockedFindById.mockImplementation(async (_id: string, tenantId: string) =>
      tenantId === OTHER_TENANT ? makeVehicle() : null
    );

    const result = await resolver.resolveById('vehicle-1', TENANT);
    expect(result).toEqual({ status: 'not_found' });
  });
});

describe('VehicleIdentityResolver.resolveByPlate', () => {
  it('resolves a plate that matches exactly one active vehicle', async () => {
    const vehicle = makeVehicle();
    mockedFindByLicensePlates.mockResolvedValue([vehicle]);

    const result = await resolver.resolveByPlate('HRE1234', TENANT);

    expect(result).toEqual({ status: 'resolved', vehicle });
  });

  it('normalizes plate casing/whitespace before lookup', async () => {
    mockedFindByLicensePlates.mockResolvedValue([makeVehicle()]);

    await resolver.resolveByPlate('  hre1234  ', TENANT);

    expect(mockedFindByLicensePlates).toHaveBeenCalledWith(['HRE1234'], TENANT);
  });

  it('fails closed (not_found) when no vehicle carries this plate', async () => {
    mockedFindByLicensePlates.mockResolvedValue([]);
    const result = await resolver.resolveByPlate('GHOST999', TENANT);
    expect(result).toEqual({ status: 'not_found' });
  });

  it('fails closed for a null/undefined/blank plate without querying the repository', async () => {
    expect(await resolver.resolveByPlate(null, TENANT)).toEqual({ status: 'not_found' });
    expect(await resolver.resolveByPlate(undefined, TENANT)).toEqual({ status: 'not_found' });
    expect(await resolver.resolveByPlate('   ', TENANT)).toEqual({ status: 'not_found' });
    expect(mockedFindByLicensePlates).not.toHaveBeenCalled();
  });

  it('AMBIGUOUS PLATE: fails closed rather than silently picking the first of several matches', async () => {
    const vehicleA = makeVehicle({ _id: 'vehicle-a' });
    const vehicleB = makeVehicle({ _id: 'vehicle-b' });
    mockedFindByLicensePlates.mockResolvedValue([vehicleA, vehicleB]);

    const result = await resolver.resolveByPlate('HRE1234', TENANT);

    expect(result).toEqual({ status: 'ambiguous', count: 2 });
    // Must not silently resolve to either candidate.
    expect(result).not.toMatchObject({ status: 'resolved' });
  });
});

describe('VehicleIdentityResolver.resolveByIdInScope / resolveByPlateInScope', () => {
  it('resolves a vehicle within the caller\'s accessible org units', async () => {
    const vehicle = makeVehicle({ orgUnitId: HARARE_BRANCH });
    mockedFindById.mockResolvedValue(vehicle);

    const result = await resolver.resolveByIdInScope('vehicle-1', makeContext([HARARE_BRANCH]));

    expect(result).toEqual({ status: 'resolved', vehicle });
  });

  it('CROSS-ORG-UNIT: a vehicle outside the caller\'s accessible org units resolves as not_found, not as a distinguishable forbidden result', async () => {
    const bulawayoVehicle = makeVehicle({ orgUnitId: BULAWAYO_BRANCH });
    mockedFindById.mockResolvedValue(bulawayoVehicle);

    const result = await resolver.resolveByIdInScope('vehicle-1', makeContext([HARARE_BRANCH]));

    expect(result).toEqual({ status: 'not_found' });
  });

  it('an org-wide caller (accessibleOrgUnitIds: null) can resolve any vehicle in the tenant', async () => {
    const bulawayoVehicle = makeVehicle({ orgUnitId: BULAWAYO_BRANCH });
    mockedFindById.mockResolvedValue(bulawayoVehicle);

    const result = await resolver.resolveByIdInScope('vehicle-1', makeContext(null));

    expect(result).toEqual({ status: 'resolved', vehicle: bulawayoVehicle });
  });

  it('a scope-narrowed caller cannot resolve a vehicle with no orgUnitId assigned', async () => {
    const unassignedVehicle = makeVehicle({ orgUnitId: undefined });
    mockedFindById.mockResolvedValue(unassignedVehicle);

    const result = await resolver.resolveByIdInScope('vehicle-1', makeContext([HARARE_BRANCH]));

    expect(result).toEqual({ status: 'not_found' });
  });

  it('resolveByPlateInScope applies the same org-unit check as resolveByIdInScope', async () => {
    mockedFindByLicensePlates.mockResolvedValue([makeVehicle({ orgUnitId: BULAWAYO_BRANCH })]);

    const result = await resolver.resolveByPlateInScope('HRE1234', makeContext([HARARE_BRANCH]));

    expect(result).toEqual({ status: 'not_found' });
  });

  it('an ambiguous plate stays ambiguous even for an org-scoped caller (not silently narrowed to one match)', async () => {
    mockedFindByLicensePlates.mockResolvedValue([
      makeVehicle({ _id: 'vehicle-a', orgUnitId: HARARE_BRANCH }),
      makeVehicle({ _id: 'vehicle-b', orgUnitId: HARARE_BRANCH }),
    ]);

    const result = await resolver.resolveByPlateInScope('HRE1234', makeContext([HARARE_BRANCH]));

    expect(result).toEqual({ status: 'ambiguous', count: 2 });
  });
});
