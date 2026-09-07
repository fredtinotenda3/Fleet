// tests/security/org-unit-write-roundtrip.spec.ts
//
// "POST 201, then GET returns nothing."
//
// ---------------------------------------------------------------------
// THE CLASS OF BUG THIS PINS
// ---------------------------------------------------------------------
// Eight modules shipped a create path that never wrote `orgUnitId`
// while their read path filtered on it. The write succeeds, the read
// matches nothing, and the user watches the record they just saved
// disappear. Two properties made it survive review repeatedly:
//
//   1. It is FAIL-CLOSED, so it never trips a security test and never
//      logs anything. The screen just looks empty.
//   2. An org-wide admin has `accessibleOrgUnitIds === null`, so no
//      filter is applied and they see every record. Whoever demos the
//      product is usually an admin, so it works right up until a real
//      branch manager logs in.
//
// tests/security/write-scope-conformance.spec.ts is the cheap
// structural net for this. It cannot catch the two cases where a file
// MENTIONS orgUnitId without any value reaching Mongo -- drivers
// (computed in the controller, then stripped by zod) and fuel-cards
// (mentioned only in a read check). Those are the ones that actually
// shipped, so this file asserts the property that matters directly:
//
//     the document handed to the repository contains orgUnitId
//
// Asserted at the repository boundary rather than through a real Mongo
// round trip, because that boundary is where the field was being lost
// and because the suite has to run without a mongod (see
// tests/helpers/fake-collection.ts for the same reasoning).

import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import { userWriteScope, systemWriteScope } from '../../server/tenancy/write-scope';

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const HARARE = 'branch-harare';
const BULAWAYO = 'branch-bulawayo';

function scopedContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: ORG,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  };
}

/** A branch manager narrowed to Harare. The role the bugs were invisible to. */
const harareManager = scopedContext([HARARE]);
/** An organization admin. The role the bugs were invisible FROM. */
const orgAdmin = scopedContext(null);

// ─────────────────────────────────────────────────────────────────────
// drivers
// ─────────────────────────────────────────────────────────────────────

jest.mock('../../modules/drivers/repositories/driver.repository', () => ({
  driverRepository: { create: jest.fn(), findById: jest.fn() },
  DriverRepository: class {},
}));
jest.mock('../../server/events/bus/EventBusFactory', () => ({
  EventBusFactory: { getInstance: () => ({ publish: jest.fn().mockResolvedValue(undefined) }) },
}));

import { driverRepository } from '../../modules/drivers/repositories/driver.repository';
import { DriverService } from '../../modules/drivers/services/driver.service';

describe('drivers: the reported "POST 201, GET empty" bug', () => {
  const create = driverRepository.create as jest.Mock;
  const service = new DriverService(driverRepository as never);

  beforeEach(() => {
    create.mockReset();
    create.mockImplementation((payload: Record<string, unknown>) => ({
      _id: 'driver-new',
      ...payload,
    }));
  });

  it('stamps the submitting branch manager\'s org unit onto the persisted document', async () => {
    await service.create({ name: 'Fanuel' }, userWriteScope(harareManager), 'user-1');

    const [persisted] = create.mock.calls[0];
    expect(persisted).toEqual(expect.objectContaining({ orgUnitId: HARARE }));
  });

  it('REGRESSION: orgUnitId survives zod validation', async () => {
    // The original defect. driverCreateSchema is a plain z.object, which
    // strips unknown keys, so an orgUnitId passed through `rawData` was
    // silently removed before the payload was built. If a future change
    // routes the value back through the schema, this fails.
    await service.create(
      { name: 'Fanuel', orgUnitId: HARARE },
      userWriteScope(harareManager),
      'user-1'
    );

    const [persisted] = create.mock.calls[0];
    expect(persisted.orgUnitId).toBe(HARARE);
  });

  it('REGRESSION: the payload allowlist does not drop orgUnitId', async () => {
    // The second half of the original defect: even had the value
    // survived validation, DriverService built an explicit allowlist
    // payload that never named the field. This asserts the field is in
    // the object actually handed to the repository -- the only place
    // the allowlist can be observed from outside.
    await service.create({ name: 'Fanuel' }, userWriteScope(harareManager), 'user-1');

    const [persisted] = create.mock.calls[0];
    expect(Object.keys(persisted)).toContain('orgUnitId');
  });

  it('refuses a scope-narrowed caller filing into another branch', async () => {
    await expect(
      service.create({ name: 'Fanuel', orgUnitId: BULAWAYO }, userWriteScope(harareManager), 'u')
    ).rejects.toThrow(/outside your assigned scope/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('lets an org-wide admin file a driver into a named branch', async () => {
    await service.create({ name: 'Fanuel', orgUnitId: BULAWAYO }, userWriteScope(orgAdmin), 'u');

    const [persisted] = create.mock.calls[0];
    expect(persisted.orgUnitId).toBe(BULAWAYO);
  });

  it('lets an org-wide admin create an unassigned driver, and writes no orgUnitId key', async () => {
    // Deliberate: an absent field and an explicit `null` behave
    // differently under the `$in` scope filter and under `$exists`
    // checks. The unassigned case must leave the key off entirely.
    await service.create({ name: 'Fanuel' }, userWriteScope(orgAdmin), 'u');

    const [persisted] = create.mock.calls[0];
    expect(Object.keys(persisted)).not.toContain('orgUnitId');
  });

  it('refuses a caller with no org-unit assignment at all', async () => {
    // accessibleOrgUnitIds: [] is "scoped, but to nothing". There is no
    // correct unit, and a record written here would be invisible to
    // everyone including its author.
    await expect(
      service.create({ name: 'Fanuel' }, userWriteScope(scopedContext([])), 'u')
    ).rejects.toThrow(/no org unit assignment/i);
    expect(create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// vehicle-derived writes
// ─────────────────────────────────────────────────────────────────────

jest.mock('../../modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { findById: jest.fn(), findByLicensePlates: jest.fn() },
}));

import { vehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import {
  vehicleWriteResolver,
  VEHICLE_PLATE_AMBIGUOUS,
} from '../../modules/vehicles/services/vehicle-write-resolver.service';

const harareTruck = {
  _id: 'vehicle-harare',
  tenantId: ORG,
  license_plate: 'AFK5777',
  orgUnitId: HARARE,
};
const bulawayoTruck = {
  _id: 'vehicle-bulawayo',
  tenantId: ORG,
  license_plate: 'AFK4234',
  orgUnitId: BULAWAYO,
};
const unassignedTruck = {
  _id: 'vehicle-unassigned',
  tenantId: ORG,
  license_plate: 'AFK0001',
};

describe('vehicleWriteResolver: the cross-tenant / cross-branch write path', () => {
  const findByPlates = vehicleRepository.findByLicensePlates as jest.Mock;

  beforeEach(() => findByPlates.mockReset());

  it('resolves a vehicle in the caller\'s own branch', async () => {
    findByPlates.mockResolvedValue([harareTruck]);
    const v = await vehicleWriteResolver.resolveForWrite('AFK5777', userWriteScope(harareManager));
    expect(v._id).toBe('vehicle-harare');
  });

  it('normalizes the plate before looking it up', async () => {
    findByPlates.mockResolvedValue([harareTruck]);
    await vehicleWriteResolver.resolveForWrite('  afk5777 ', userWriteScope(harareManager));
    expect(findByPlates).toHaveBeenCalledWith(['AFK5777'], ORG);
  });

  it('never queries outside the caller\'s tenant', async () => {
    findByPlates.mockResolvedValue([]);
    await expect(
      vehicleWriteResolver.resolveForWrite('AFK5777', userWriteScope(harareManager))
    ).rejects.toThrow(/not found/i);
    // The tenant is passed to the repository, which is what makes a
    // same-plate vehicle in another tenant unreachable. The original
    // defect was a raw findOne with no tenantId at all.
    expect(findByPlates).toHaveBeenCalledWith(['AFK5777'], ORG);
  });

  it('refuses a branch manager filing against another branch\'s vehicle', async () => {
    findByPlates.mockResolvedValue([bulawayoTruck]);
    await expect(
      vehicleWriteResolver.resolveForWrite('AFK4234', userWriteScope(harareManager))
    ).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND', statusCode: 400 });
  });

  it('reports out-of-scope IDENTICALLY to not-found (no existence oracle)', async () => {
    findByPlates.mockResolvedValue([bulawayoTruck]);
    const outOfScope = await vehicleWriteResolver
      .resolveForWrite('AFK4234', userWriteScope(harareManager))
      .catch((e) => e);

    findByPlates.mockResolvedValue([]);
    const missing = await vehicleWriteResolver
      .resolveForWrite('AFK4234', userWriteScope(harareManager))
      .catch((e) => e);

    // Same code, same status, same message. A scope-narrowed caller must
    // not be able to probe another branch's plates one at a time.
    expect(outOfScope.code).toBe(missing.code);
    expect(outOfScope.statusCode).toBe(missing.statusCode);
    expect(outOfScope.message).toBe(missing.message);
  });

  it('refuses an ambiguous plate rather than silently picking one', async () => {
    // license_plate has no unique index. `findOne` returned whichever
    // document Mongo reached first, forever and without an error.
    findByPlates.mockResolvedValue([harareTruck, { ...harareTruck, _id: 'vehicle-dup' }]);
    await expect(
      vehicleWriteResolver.resolveForWrite('AFK5777', userWriteScope(orgAdmin))
    ).rejects.toMatchObject({ code: VEHICLE_PLATE_AMBIGUOUS, statusCode: 409 });
  });

  it('a scope-narrowed caller cannot write against a vehicle with no org unit', async () => {
    // Such a vehicle is invisible to this caller's scoped READ, so it
    // must be unwritable too -- otherwise they can post costs against a
    // vehicle they cannot see.
    findByPlates.mockResolvedValue([unassignedTruck]);
    await expect(
      vehicleWriteResolver.resolveForWrite('AFK0001', userWriteScope(harareManager))
    ).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
  });

  it('an org-wide caller CAN write against a vehicle with no org unit', async () => {
    findByPlates.mockResolvedValue([unassignedTruck]);
    const v = await vehicleWriteResolver.resolveForWrite('AFK0001', userWriteScope(orgAdmin));
    expect(v._id).toBe('vehicle-unassigned');
    // ...and the record inherits no unit rather than an invented one.
    expect(vehicleWriteResolver.orgUnitIdFor(v)).toBeUndefined();
  });

  it('a system write is tenant-scoped but not org-unit scoped', async () => {
    findByPlates.mockResolvedValue([bulawayoTruck]);
    const v = await vehicleWriteResolver.resolveForWrite(
      'AFK4234',
      systemWriteScope(ORG, 'worker has no acting user')
    );
    expect(v._id).toBe('vehicle-bulawayo');
    expect(findByPlates).toHaveBeenCalledWith(['AFK4234'], ORG);
  });

  it('the record inherits the VEHICLE\'s unit, not the submitter\'s', async () => {
    // The property that keeps a Bulawayo truck's costs in Bulawayo even
    // when an org-wide admin sitting in Harare enters them.
    findByPlates.mockResolvedValue([bulawayoTruck]);
    const v = await vehicleWriteResolver.resolveForWrite('AFK4234', userWriteScope(orgAdmin));
    expect(vehicleWriteResolver.orgUnitIdFor(v)).toBe(BULAWAYO);
  });
});

describe('systemWriteScope requires a stated reason', () => {
  it('rejects an empty reason', () => {
    expect(() => systemWriteScope(ORG, '')).toThrow(/non-empty reason/);
    expect(() => systemWriteScope(ORG, '   ')).toThrow(/non-empty reason/);
  });
});
