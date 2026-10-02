// tests/security/dispatch-tenant-scope.spec.ts
//
// ROUND 4 (Trips <-> Dispatch connectivity) -- architectural discovery
// found a complete, previously-shipped Dispatch backend
// (modules/dispatch/**, app/api/dispatch/**) with correct permissions
// already modeled, but the EXACT SAME org-unit-scoping gap
// `hostile-review-round.spec.ts`'s "every work-order operation is
// org-unit scoped" suite pins for WorkOrder: only `create` resolved a
// full TenantContext, every other operation (list/board/get/assign/
// changeStatus) resolved a bare tenantId and never checked org-unit
// scope at all, despite DispatchRepository already having the scoped
// queries (getFilteredInScope/getActiveBoardInScope) sitting unused.
//
// This pins the same fix, using the same static-inspection technique
// (read the source, assert on its shape) as that suite, rather than
// duplicating it into a second generic "every module is scoped"
// parametrized test -- a module-specific pin is what caught the
// original gap and is what would catch a regression of it.
//
// Also pins the cross-vehicle/cross-driver/cross-branch validation
// `assign()` had none of before this round (resolveByIdForWrite /
// resolveForWrite), and that the double-booking guard is deliberately
// TENANT-wide rather than narrowed to the caller's org-unit scope (see
// DispatchService.assign's own doc comment for why narrowing it would
// hide the one case it matters most for).

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const readRaw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Comments quote the code they replaced; match against source only. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (rel: string) => stripComments(readRaw(rel));

const CONTROLLER = 'modules/dispatch/controllers/dispatch.controller.ts';
const SERVICE = 'modules/dispatch/services/dispatch.service.ts';

describe('every dispatch operation is org-unit scoped', () => {
  it('the controller resolves a TenantContext everywhere, not a bare tenantId', () => {
    const src = read(CONTROLLER);
    expect(src).not.toMatch(/getTenantFromRequest/);
    // list, board, get, create, assign, changeStatus, linkTrip, cost.
    expect((src.match(/resolveTenantContext\(req\)/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it('the list and board endpoints use the scoped repository queries', () => {
    const controller = read(CONTROLLER);
    expect(controller).toMatch(/dispatchService\.listInScope\(/);
    expect(controller).toMatch(/dispatchService\.getBoardInScope\(/);

    const service = read(SERVICE);
    expect(service).toMatch(/listInScope[\s\S]{0,200}getFilteredInScope/);
    expect(service).toMatch(/getBoardInScope[\s\S]{0,200}getActiveBoardInScope/);
  });

  it('every by-id operation asserts scope before acting', () => {
    const service = read(SERVICE);
    expect(service).toMatch(/private assertInScope/);
    expect(service).toMatch(/canAccessRecord/);

    // One call per by-id operation: assign, changeStatus, get,
    // assertCanLinkTrip (which both attachCreatedTrip and
    // linkExistingTrip route through, rather than re-checking scope a
    // second way).
    const calls = (service.match(/this\.assertInScope\(/g) ?? []).length;
    expect({ assertInScopeCalls: calls }).toEqual({ assertInScopeCalls: 4 });
  });

  it('an out-of-scope dispatch job reads as NOT FOUND, never FORBIDDEN', () => {
    // A 403 confirms the record exists, which is itself a disclosure
    // across a boundary the caller may not see across -- same
    // disclosure argument WorkOrder's identical fix documents.
    const service = read(SERVICE);
    expect(service).toMatch(/assertInScope[\s\S]{0,200}NotFoundError\('Dispatch job not found'\)/);
    expect(service).not.toMatch(/assertInScope[\s\S]{0,200}ForbiddenError/);
  });

  it('assertCanLinkTrip -- the single gate both Dispatch <-> Trip linking directions share -- also checks scope', () => {
    const service = read(SERVICE);
    const body = service.slice(service.indexOf('async assertCanLinkTrip('), service.indexOf('async attachCreatedTrip('));
    expect(body).toMatch(/this\.assertInScope\(/);
  });

  it('linkExistingTrip checks the TRIP\'s own org-unit scope too, not only the dispatch job\'s', () => {
    // The dispatch side is covered by assertCanLinkTrip; the trip being
    // linked is a SEPARATE record with its own orgUnitId, and nothing
    // stops a caller from naming a trip they cannot otherwise see
    // unless this is checked independently.
    const service = read(SERVICE);
    const body = service.slice(service.indexOf('async linkExistingTrip('), service.indexOf('private deriveStatusFromTrip('));
    expect(body).toMatch(/canAccessRecord\(scope\.context, trip\.orgUnitId\)/);
    expect(body).toMatch(/NotFoundError\('Trip not found'\)/);
  });
});

describe('dispatch assign() validates vehicle, driver and branch -- not a bare id copy', () => {
  it('resolves both the vehicle and the driver through the write-scope resolvers before any write', () => {
    const service = read(SERVICE);
    const body = service.slice(service.indexOf('async assign('), service.indexOf('async changeStatus('));
    expect(body).toMatch(/vehicleWriteResolver\.resolveByIdForWrite\(vehicleId, scope\)/);
    expect(body).toMatch(/driverWriteResolver\.resolveForWrite\(driverId, scope\)/);

    // Both resolutions happen BEFORE the repository update -- a
    // rejected resolution must never reach a write.
    const vehicleAt = body.indexOf('vehicleWriteResolver.resolveByIdForWrite');
    const driverAt = body.indexOf('driverWriteResolver.resolveForWrite');
    const updateAt = body.indexOf('this.repo.update(');
    expect(vehicleAt).toBeGreaterThan(-1);
    expect(driverAt).toBeGreaterThan(-1);
    expect(updateAt).toBeGreaterThan(vehicleAt);
    expect(updateAt).toBeGreaterThan(driverAt);
  });

  it('the double-booking guard reads the TENANT-wide board, not an org-unit-narrowed one', () => {
    // Narrowing this to the caller's own scope would hide exactly the
    // case it exists to catch: the same vehicle/driver double-booked by
    // two DIFFERENT branches' dispatchers.
    const service = read(SERVICE);
    const body = service.slice(service.indexOf('async assign('), service.indexOf('async changeStatus('));
    expect(body).toMatch(/this\.repo\.getActiveBoard\(tenantId\)/);
    expect(body).not.toMatch(/getActiveBoardInScope/);
  });
});

describe('dispatch route permissions match what the service enforces', () => {
  const routeFiles: Array<[string, string]> = [
    ['app/api/dispatch/route.ts', 'GET.*DISPATCH_VIEW|DISPATCH_VIEW.*GET'],
    ['app/api/dispatch/board/route.ts', 'DISPATCH_VIEW'],
    ['app/api/dispatch/[id]/route.ts', 'DISPATCH_VIEW'],
    ['app/api/dispatch/[id]/assign/route.ts', 'DISPATCH_ASSIGN'],
    ['app/api/dispatch/[id]/status/route.ts', 'DISPATCH_MANAGE'],
    ['app/api/dispatch/[id]/link-trip/route.ts', 'DISPATCH_MANAGE'],
    ['app/api/dispatch/[id]/cost/route.ts', 'DISPATCH_VIEW'],
  ];

  it.each(routeFiles)('%s is wrapped in withAuth with the expected permission', (file) => {
    const src = read(file);
    expect(src).toMatch(/withAuth/);
    expect(src).toMatch(/permission: Permission\.DISPATCH_/);
  });

  it('POST /api/dispatch (create) requires DISPATCH_CREATE', () => {
    const src = read('app/api/dispatch/route.ts');
    expect(src).toMatch(/POST[\s\S]{0,120}Permission\.DISPATCH_CREATE/);
  });

  it('link-trip is gated on DISPATCH_MANAGE, not the narrower DISPATCH_ASSIGN -- linking changes status and cost, not just who is assigned', () => {
    const src = read('app/api/dispatch/[id]/link-trip/route.ts');
    expect(src).toMatch(/Permission\.DISPATCH_MANAGE/);
    expect(src).not.toMatch(/Permission\.DISPATCH_ASSIGN/);
  });
});
