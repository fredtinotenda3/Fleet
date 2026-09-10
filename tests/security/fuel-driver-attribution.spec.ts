// tests/security/fuel-driver-attribution.spec.ts
//
// "The driver I picked shows as Unassigned in Fuel Cost by Driver."
//
// ---------------------------------------------------------------------
// THE DEFECT
// ---------------------------------------------------------------------
// `fuelLogBaseSchema` never declared `driver_id`, and a plain z.object
// STRIPS unknown keys. So the value the form sent, the value the
// spreadsheet importer resolved from a driver's name, and the value the
// handler copied into its payload were all deleted in transit -- on
// create and on update alike. CreateFuelLogHandler then read it back
// through `(validated as Record<string, unknown>).driver_id`, a cast
// that made the permanently-`undefined` result type-check.
//
// Nothing errored. Every fuel log landed in the single null bucket
// getFuelByDriver renders as "Unassigned", and the chart looked like a
// data-entry problem rather than a code one.
//
// This is the third instance of the same class in this codebase -- a
// value the caller computed, dropped by a z.object strip, cast around so
// it compiles. Drivers' `orgUnitId` was the first two.
//
// ---------------------------------------------------------------------
// WHAT THIS FILE ASSERTS
// ---------------------------------------------------------------------
//  1. The SCHEMA preserves driver_id. This is the assertion that goes
//     red if anyone removes the field again, and it is one line.
//  2. The document handed to the repository carries driver_id -- the
//     property that actually failed, asserted at the boundary where it
//     was being lost (the same reasoning as
//     org-unit-write-roundtrip.spec.ts).
//  3. A driver can be CLEARED, not just replaced. Without this an
//     incorrectly attributed log corrupts a driver's cost figures
//     permanently.
//  4. The driver is resolved under the caller's SCOPE, so a branch
//     manager cannot attribute fuel to another branch's driver, and the
//     refusal is indistinguishable from "no such driver".
//  5. The historical-correctness rule: nothing back-fills the VEHICLE's
//     current driver onto a log that has none.

import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import { userWriteScope } from '../../server/tenancy/write-scope';
import { fuelLogCreateSchema, fuelLogUpdateSchema } from '../../shared/validations/fuel.schema';

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const HARARE = 'branch-harare';
const BULAWAYO = 'branch-bulawayo';

const HARARE_DRIVER = '68b1f2c4d1e2a30011111111';
const BULAWAYO_DRIVER = '68b1f2c4d1e2a30022222222';

function scopedContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: ORG,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as TenantContext;
}

const harareManager = scopedContext([HARARE]);
const orgAdmin = scopedContext(null);

// ─────────────────────────────────────────────────────────────────────
// 1. the schema itself
// ─────────────────────────────────────────────────────────────────────

describe('fuelLogCreateSchema: driver_id survives validation', () => {
  const base = {
    license_plate: 'AFU0078',
    date: '2026-09-01',
    fuel_volume: 50,
    unit_id: 'L',
    cost: 100,
    payment_method: 'cash' as const,
  };

  it('keeps a supplied driver_id', () => {
    const parsed = fuelLogCreateSchema.parse({ ...base, driver_id: HARARE_DRIVER });
    // The whole bug in one assertion. Before the fix this key was absent.
    expect((parsed as Record<string, unknown>).driver_id).toBe(HARARE_DRIVER);
  });

  it('accepts a log with no driver at all', () => {
    const parsed = fuelLogCreateSchema.parse(base);
    expect((parsed as Record<string, unknown>).driver_id).toBeUndefined();
  });

  it('accepts an explicit null so an attribution can be removed', () => {
    const parsed = fuelLogUpdateSchema.parse({ _id: 'log-1', driver_id: null });
    expect((parsed as Record<string, unknown>).driver_id).toBeNull();
  });

  it('keeps driver_id on update', () => {
    const parsed = fuelLogUpdateSchema.parse({ _id: 'log-1', driver_id: BULAWAYO_DRIVER });
    expect((parsed as Record<string, unknown>).driver_id).toBe(BULAWAYO_DRIVER);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2-5. the write path
// ─────────────────────────────────────────────────────────────────────

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

/**
 * The vehicle AFU0078 lives in Harare and currently has a Harare driver
 * assigned to it. That assignment is what must NOT leak onto a fuel log
 * that names nobody -- see the historical-correctness test at the end.
 */
const AFU0078 = {
  _id: '68b1f2c4d1e2a30099999999',
  license_plate: 'AFU0078',
  orgUnitId: HARARE,
  tenantId: ORG,
  assigned_driver_id: HARARE_DRIVER,
};

const DRIVERS: Record<string, Record<string, unknown>> = {
  [HARARE_DRIVER]: { _id: HARARE_DRIVER, name: 'Tendai Moyo', orgUnitId: HARARE, tenantId: ORG },
  [BULAWAYO_DRIVER]: { _id: BULAWAYO_DRIVER, name: 'Rudo Ncube', orgUnitId: BULAWAYO, tenantId: ORG },
};

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

  // Only the collections these handlers actually touch. `tblunits` is the
  // one every path needs; the others are only read when the payload names
  // them, and no payload here does.
  connect.mockResolvedValue({
    collection: (name: string) => ({
      findOne: async () => (name === 'tblunits' ? { unit_id: 'L', type: 'volume' } : null),
    }),
  });
});

const fuelRepoStub = { create: fuelCreate, update: fuelUpdate } as never;

function createCommand(raw: Record<string, unknown>, context: TenantContext) {
  return new CreateFuelLogCommand(
    {
      license_plate: 'AFU0078',
      date: '2026-09-01',
      fuel_volume: 50,
      unit_id: 'L',
      cost: 100,
      payment_method: 'cash',
      ...raw,
    },
    ORG,
    userWriteScope(context),
    'user-1'
  );
}

describe('CreateFuelLogHandler: the driver reaches the database', () => {
  it('writes the driver the caller named', async () => {
    const handler = new CreateFuelLogHandler(fuelRepoStub);
    await handler.execute(createCommand({ driver_id: HARARE_DRIVER }, harareManager));

    expect(fuelCreate).toHaveBeenCalledTimes(1);
    const written = fuelCreate.mock.calls[0][0] as Record<string, unknown>;
    // THE regression. Before the fix this key was absent from the
    // document, on every single fuel log ever written.
    expect(written.driver_id).toBe(HARARE_DRIVER);
  });

  it('writes no driver when none was named, rather than inventing one', async () => {
    const handler = new CreateFuelLogHandler(fuelRepoStub);
    await handler.execute(createCommand({}, harareManager));

    const written = fuelCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(written.driver_id).toBeUndefined();
  });

  it("does NOT back-fill the vehicle's currently assigned driver", async () => {
    // The vehicle has assigned_driver_id set. A fuel log with no driver
    // is unattributed fuel, not fuel attributed to whoever happens to
    // drive that truck today -- back-filling would move one person's
    // spend onto another and would change retroactively every time the
    // vehicle is reassigned.
    const handler = new CreateFuelLogHandler(fuelRepoStub);
    await handler.execute(createCommand({}, orgAdmin));

    const written = fuelCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(written.driver_id).toBeUndefined();
    expect(Object.values(written)).not.toContain(HARARE_DRIVER);
  });

  it('refuses a driver from another branch, indistinguishably from a missing one', async () => {
    const handler = new CreateFuelLogHandler(fuelRepoStub);

    const outOfScope = handler
      .execute(createCommand({ driver_id: BULAWAYO_DRIVER }, harareManager))
      .catch((e: Error & { code?: string }) => e);
    const missing = handler
      .execute(createCommand({ driver_id: '68b1f2c4d1e2a30000000000' }, harareManager))
      .catch((e: Error & { code?: string }) => e);

    const [a, b] = await Promise.all([outOfScope, missing]);
    expect((a as { code?: string }).code).toBe('DRIVER_NOT_FOUND');
    expect((b as { code?: string }).code).toBe('DRIVER_NOT_FOUND');
    // Identical shape on purpose: a distinguishable "exists but
    // forbidden" lets a branch manager enumerate another branch's roster
    // one id at a time.
    expect((a as Error).message.replace(BULAWAYO_DRIVER, 'ID')).toBe(
      (b as Error).message.replace('68b1f2c4d1e2a30000000000', 'ID')
    );
    expect(fuelCreate).not.toHaveBeenCalled();
  });

  it('lets an org-wide admin name a driver in any branch', async () => {
    const handler = new CreateFuelLogHandler(fuelRepoStub);
    await handler.execute(createCommand({ driver_id: BULAWAYO_DRIVER }, orgAdmin));

    const written = fuelCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(written.driver_id).toBe(BULAWAYO_DRIVER);
  });
});

describe('UpdateFuelLogHandler: an attribution can be corrected and removed', () => {
  function updateCommand(raw: Record<string, unknown>, context: TenantContext) {
    return new UpdateFuelLogCommand('fuel-1', raw, ORG, userWriteScope(context), 'user-1');
  }

  it('replaces the driver', async () => {
    const handler = new UpdateFuelLogHandler(fuelRepoStub);
    await handler.execute(updateCommand({ driver_id: HARARE_DRIVER }, harareManager));

    const patch = fuelUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.driver_id).toBe(HARARE_DRIVER);
  });

  it('clears the driver when an empty value is sent', async () => {
    // The form sends '' for its "Unassigned" option. Before the fix the
    // update loop skipped every empty value, so a log attributed to the
    // wrong driver could be re-pointed but never returned to
    // unattributed -- leaving a known-wrong name on someone's fuel
    // spend forever.
    const handler = new UpdateFuelLogHandler(fuelRepoStub);
    await handler.execute(updateCommand({ driver_id: '' }, harareManager));

    const patch = fuelUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(patch).toHaveProperty('driver_id', null);
  });

  it('still refuses to blank a required field with an empty value', async () => {
    // The clear behaviour is deliberately narrow: '' means "remove this"
    // only for the optional foreign keys where that is a meaningful
    // instruction. An empty license plate is a malformed submission.
    const handler = new UpdateFuelLogHandler(fuelRepoStub);
    await handler.execute(updateCommand({ license_plate: '', notes: 'topped up' }, harareManager));

    const patch = fuelUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('license_plate');
    expect(patch.notes).toBe('topped up');
  });

  it('refuses to move an attribution to another branch', async () => {
    const handler = new UpdateFuelLogHandler(fuelRepoStub);
    const error = await handler
      .execute(updateCommand({ driver_id: BULAWAYO_DRIVER }, harareManager))
      .catch((e: Error & { code?: string }) => e);

    expect((error as { code?: string }).code).toBe('DRIVER_NOT_FOUND');
    expect(fuelUpdate).not.toHaveBeenCalled();
  });
});
