// tests/regression/workorder-vehicle-plate-substring-leak.spec.ts
//
// WAVE 1 PART 2, item 7 (discovered along the way): the SAME
// substring-match vehicle-identity leak fixed for trips in item 3
// (see tests/security/trip-history-vehicle-scope.spec.ts) also existed
// in WorkOrderFilters/WorkOrderRepository. `license_plate` alone
// matches as a case-insensitive, UNANCHORED substring (containsMatch),
// so a caller asking for "this ONE vehicle's" open work orders --
// exactly what NeedsAttentionService.getFeedForVehicle's
// readOpenWorkOrdersForVehicle needs -- would also receive another
// vehicle's work orders whenever one plate is a substring of another
// ("HRE123" also matching "HRE1234" or "XHRE123Y").
//
// Fixed the same way as trips: an opt-in `exactLicensePlate` flag on
// WorkOrderFilters, applied in BOTH getFiltered() (tenant-only) and
// buildScopedQuery() (used by getFilteredInScope/getFilteredForExport/
// countByStatusInScope), defaulting to the unchanged substring
// behavior so the Work Orders list page's search box (and its
// "view this vehicle's work orders" link, which pre-fills that same
// search box rather than opening a dedicated vehicle-only view) keeps
// its existing, correct UX contract.
//
// This is a REGRESSION test, not a re-statement of the trips test: it
// pins the work-order repository's OWN query-building code
// (buildScopedQuery/getFiltered), which is a separate implementation
// from tripRepository's, so a future refactor of one cannot silently
// reintroduce the leak in the other undetected.

import { workOrderRepository } from '../../modules/workorders/repositories/workorder.repository';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

const ORG = 'willsgrove-farm-enterprises-9e80ed';

const ORG_WIDE_CONTEXT: TenantContext = {
  organizationId: ORG,
  organizationName: 'Willsgrove Farm Enterprises',
  accessibleOrgUnitIds: null,
  isPlatformScope: false,
  assignedOrgUnitIds: [],
};

/** Captures the query the repository sends to Mongo, without needing a real database. */
function mockCollection() {
  const calls: { find?: unknown; countDocuments?: unknown } = {};
  const cursor = {
    sort: () => cursor,
    skip: () => cursor,
    limit: () => cursor,
    toArray: async () => [],
  };
  const collection = {
    find: (query: unknown) => {
      calls.find = query;
      return cursor;
    },
    countDocuments: async (query: unknown) => {
      calls.countDocuments = query;
      return 0;
    },
    aggregate: () => ({ toArray: async () => [] }),
  };
  return { collection, calls };
}

describe('exact vehicle-plate matching for work orders (behavioral)', () => {
  it('exactLicensePlate: true, via getFilteredInScope, sends an exact case-folded equality match, not a regex', async () => {
    const { collection, calls } = mockCollection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getCollection is private; spying on it to intercept the query without a real Mongo requires this cast.
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    await workOrderRepository.getFilteredInScope(
      { status: 'open', license_plate: 'hre123', exactLicensePlate: true },
      ORG_WIDE_CONTEXT,
      { page: 1, limit: 100 }
    );

    const query = calls.find as Record<string, unknown>;
    expect(query.license_plate).toBe('HRE123');
  });

  it('the default (non-exact) mode is still a case-insensitive substring, unchanged for the list page search box', async () => {
    const { collection, calls } = mockCollection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getCollection is private; spying on it to intercept the query without a real Mongo requires this cast.
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    await workOrderRepository.getFilteredInScope(
      { license_plate: 'HRE123' },
      ORG_WIDE_CONTEXT,
      { page: 1, limit: 100 }
    );

    const query = calls.find as Record<string, unknown>;
    // containsMatch (shared/utils/regex.utils.ts) produces a Mongo
    // `{ $regex, $options: 'i' }` matcher, not a plain string equality --
    // reconstruct it as a real RegExp to prove what it actually matches.
    const matcher = query.license_plate as { $regex: string; $options: string };
    expect(matcher.$options).toBe('i');
    const regex = new RegExp(matcher.$regex, matcher.$options);
    expect('HRE1234').toMatch(regex);
    expect('XHRE123Y').toMatch(regex);
  });

  it('getFiltered (tenant-only, unscoped) also honors exactLicensePlate', async () => {
    const { collection, calls } = mockCollection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getCollection is private; spying on it to intercept the query without a real Mongo requires this cast.
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    await workOrderRepository.getFiltered(
      { license_plate: 'hre123', exactLicensePlate: true },
      ORG,
      { page: 1, limit: 100 }
    );

    const query = calls.find as Record<string, unknown>;
    expect(query.license_plate).toBe('HRE123');
  });

  it('demonstrates the actual leak the fix closes: without exactLicensePlate, "HRE123" also matches "HRE1234"', async () => {
    const { collection, calls } = mockCollection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getCollection is private; spying on it to intercept the query without a real Mongo requires this cast.
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    await workOrderRepository.getFilteredInScope(
      { license_plate: 'HRE123' },
      ORG_WIDE_CONTEXT,
      { page: 1, limit: 100 }
    );

    const query = calls.find as Record<string, unknown>;
    const matcher = query.license_plate as { $regex: string; $options: string };
    const regex = new RegExp(matcher.$regex, matcher.$options);
    // This assertion is the regression pin: it documents the substring
    // behavior is real (not merely theoretical) and confirms the fix's
    // exactLicensePlate flag is the only thing standing between a
    // vehicle-scoped caller and this leak.
    expect('HRE1234').toMatch(regex);
  });
});
