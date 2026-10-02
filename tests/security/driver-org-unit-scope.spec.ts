// tests/security/driver-org-unit-scope.spec.ts
//
// ROUND 5 (real-fleet acceptance audit) -- adversarial isolation testing
// found the IDENTICAL bug class WorkOrder and Dispatch each had before
// their own fixes, this time in Driver: `list` was scoped
// (getFilteredDriversInScope, "LEAK FIX" comment), but getById/update/
// remove resolved only a bare tenantId and stopped there. A branch-
// scoped user could GET/PUT/DELETE any other branch's driver record by
// id, exposing and mutating PII (license number/expiry, phone, email,
// notes) outside their org-unit.
//
// Pins the fix using both techniques already established for this bug
// class: a behavioral unit test against the real DriverService (easy
// here, since it takes constructor-injected repo like Dispatch/WorkOrder
// do) and a static-inspection check on the controller, mirroring
// dispatch-tenant-scope.spec.ts / hostile-review-round.spec.ts.

import fs from 'fs';
import path from 'path';
import { DriverService } from '@/modules/drivers/services/driver.service';
import { NotFoundError } from '@/server/errors/app.errors';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { Driver } from '@/shared/types/driver.types';

jest.mock('@/server/events/bus/EventBusFactory', () => ({
  EventBusFactory: { getInstance: () => ({ publish: jest.fn().mockResolvedValue(undefined) }) },
}));

const TENANT_ID = 'willsgrove-farm-enterprises-9e80ed';
const HARARE = 'branch-harare';
const BULAWAYO = 'branch-bulawayo';

function scopedContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT_ID,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as TenantContext;
}

const hararManager = scopedContext([HARARE]);
const bulawayoManager = scopedContext([BULAWAYO]);
const orgAdmin = scopedContext(null);

const BULAWAYO_DRIVER: Driver = {
  _id: 'driver-bulawayo-1',
  tenantId: TENANT_ID,
  orgUnitId: BULAWAYO,
  name: 'Tendai',
  status: 'active',
} as Driver;

function makeRepo() {
  return {
    findById: jest.fn(async (id: string) => (id === BULAWAYO_DRIVER._id ? BULAWAYO_DRIVER : null)),
    update: jest.fn(async (id: string, data: Record<string, unknown>) => ({ ...BULAWAYO_DRIVER, ...data, _id: id })),
    softDelete: jest.fn(),
    hardDelete: jest.fn(),
  };
}

describe('DriverService by-id operations are org-unit scoped', () => {
  it('getById: a branch manager outside the record\'s org-unit gets NotFoundError, never the record', async () => {
    const repo = makeRepo();
    const service = new DriverService(repo as never);

    await expect(service.getById(BULAWAYO_DRIVER._id!, hararManager)).rejects.toThrow(NotFoundError);
    await expect(service.getById(BULAWAYO_DRIVER._id!, hararManager)).rejects.toThrow(/Driver not found/);
  });

  it('getById: the record\'s own branch manager can read it', async () => {
    const repo = makeRepo();
    const service = new DriverService(repo as never);

    await expect(service.getById(BULAWAYO_DRIVER._id!, bulawayoManager)).resolves.toMatchObject({
      _id: BULAWAYO_DRIVER._id,
    });
  });

  it('getById: an org-wide admin (accessibleOrgUnitIds === null) can read any branch\'s driver', async () => {
    const repo = makeRepo();
    const service = new DriverService(repo as never);

    await expect(service.getById(BULAWAYO_DRIVER._id!, orgAdmin)).resolves.toMatchObject({
      _id: BULAWAYO_DRIVER._id,
    });
  });

  it('update: a branch manager outside the record\'s org-unit cannot mutate it, and no write is attempted', async () => {
    const repo = makeRepo();
    const service = new DriverService(repo as never);

    await expect(
      service.update(BULAWAYO_DRIVER._id!, { name: 'Changed' }, hararManager, 'user-1')
    ).rejects.toThrow(NotFoundError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('remove: a branch manager outside the record\'s org-unit cannot delete it, and no delete is attempted', async () => {
    const repo = makeRepo();
    const service = new DriverService(repo as never);

    await expect(service.remove(BULAWAYO_DRIVER._id!, hararManager, 'user-1')).rejects.toThrow(NotFoundError);
    expect(repo.softDelete).not.toHaveBeenCalled();
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });

  it('remove: the record\'s own branch manager can delete it', async () => {
    const repo = makeRepo();
    const service = new DriverService(repo as never);

    await service.remove(BULAWAYO_DRIVER._id!, bulawayoManager, 'user-1');
    expect(repo.softDelete).toHaveBeenCalledWith(BULAWAYO_DRIVER._id, TENANT_ID, 'user-1');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Static inspection: the controller must resolve a full TenantContext
// for every by-id route, not a bare tenantId -- the exact regression
// shape that made this bug invisible (it type-checked fine; a bare
// string and a TenantContext are both just "the scope" to a careless
// read of the signature).
// ─────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..');
const readRaw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (rel: string) => stripComments(readRaw(rel));

describe('driver controller resolves a full TenantContext for every by-id operation', () => {
  it('getById/update/remove all call resolveTenantContext, never getTenantFromRequest', () => {
    const src = read('modules/drivers/controllers/driver.controller.ts');
    expect(src).not.toMatch(/getTenantFromRequest/);
    // list, create, getById, update, remove.
    expect((src.match(/resolveTenantContext\(req\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('DriverService has a private assertInScope guard used by getById/update/remove', () => {
    const src = read('modules/drivers/services/driver.service.ts');
    expect(src).toMatch(/private assertInScope/);
    expect(src).toMatch(/canAccessRecord/);
    const calls = (src.match(/this\.assertInScope\(/g) ?? []).length;
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('an out-of-scope driver reads as NOT FOUND, never FORBIDDEN', () => {
    const src = read('modules/drivers/services/driver.service.ts');
    expect(src).toMatch(/assertInScope[\s\S]{0,200}NotFoundError\('Driver not found'\)/);
    expect(src).not.toMatch(/assertInScope[\s\S]{0,200}ForbiddenError/);
  });
});
