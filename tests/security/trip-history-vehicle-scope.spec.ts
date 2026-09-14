// tests/security/trip-history-vehicle-scope.spec.ts
//
// WAVE 1 PART 2, item 3: the vehicle-scoped trip history deep link
// (`/trips/vehicles/[plate]`).
//
// THE DEFECT THIS PINS: `TripFilters.license_plate` matches as a
// case-insensitive SUBSTRING (buildScopedQuery -> containsMatch),
// which is correct for the Trips page's free-text search box and wrong
// for a screen whose entire contract is "only this vehicle's trips."
// Without an exact-match mode, vehicle "HRE123"'s history page would
// also surface "HRE1234"'s trips (and vice versa) -- a real
// vehicle-identity leak within the caller's already-authorized tenant/
// org-unit scope, not a hypothetical one.
//
// Two layers are verified: the query the repository actually sends to
// MongoDB (behavioral, via a mocked collection -- no real mongod
// required, unlike tests/integration's describeWithMongo suites, since
// this property is entirely about what object buildScopedQuery
// produces, not about Mongo's own matching semantics) and the frontend
// wiring (source-text conformance, consistent with how the rest of this
// vertical slice is guarded).

import { tripRepository } from '../../modules/trips/repositories/trip.repository';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

const ORG = 'willsgrove-farm-enterprises-9e80ed';

const ORG_WIDE_CONTEXT: TenantContext = {
  organizationId: ORG,
  organizationName: 'Willsgrove Farm Enterprises',
  accessibleOrgUnitIds: null,
  isPlatformScope: false,
  assignedOrgUnitIds: [],
};

/** Captures the query `getFilteredTripsInScope` sends to Mongo, without needing a real database. */
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
  };
  return { collection, calls };
}

describe('exact vehicle-plate matching for trip history (behavioral)', () => {
  it('exactLicensePlate: true sends an exact, case-folded equality match, not a regex', async () => {
    const { collection, calls } = mockCollection();
    jest.spyOn(tripRepository as any, 'getCollection').mockResolvedValue(collection);

    await tripRepository.getFilteredTripsInScope(
      { license_plate: 'hre123', exactLicensePlate: true },
      ORG_WIDE_CONTEXT,
      { page: 1, limit: 20 }
    );

    const query = calls.find as Record<string, unknown>;
    // An exact match is the plain uppercased string -- NOT a $regex,
    // which is what would let "HRE1234" also match.
    expect(query.license_plate).toBe('HRE123');
  });

  it('the default (non-exact) mode is still a case-insensitive substring, unchanged for the search box', async () => {
    const { collection, calls } = mockCollection();
    jest.spyOn(tripRepository as any, 'getCollection').mockResolvedValue(collection);

    await tripRepository.getFilteredTripsInScope(
      { license_plate: 'HRE123' },
      ORG_WIDE_CONTEXT,
      { page: 1, limit: 20 }
    );

    const query = calls.find as Record<string, unknown>;
    expect(query.license_plate).toEqual({ $regex: 'HRE123', $options: 'i' });
  });

  it('exact matching still applies inside the caller\'s tenant/org-unit scope, not instead of it', async () => {
    const { collection, calls } = mockCollection();
    jest.spyOn(tripRepository as any, 'getCollection').mockResolvedValue(collection);

    const scoped: TenantContext = {
      ...ORG_WIDE_CONTEXT,
      accessibleOrgUnitIds: ['branch-harare'],
      assignedOrgUnitIds: ['branch-harare'],
    };

    await tripRepository.getFilteredTripsInScope(
      { license_plate: 'HRE123', exactLicensePlate: true },
      scoped,
      { page: 1, limit: 20 }
    );

    const query = calls.find as Record<string, unknown>;
    expect(query.license_plate).toBe('HRE123');
    expect(query.tenantId).toBe(ORG);
    // buildFilter's exact shape is covered by its own suite; asserting
    // its presence here is enough to prove exact-plate matching did not
    // replace org-unit scoping rather than add to it.
    expect(JSON.stringify(query)).toMatch(/branch-harare/);
  });
});

describe('the vehicle trip-history screen forces exact matching (frontend wiring)', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../..');
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  it('VehicleTripHistoryPage sets exactLicensePlate: true', () => {
    const page = read('frontend/modules/trips/pages/VehicleTripHistoryPage.tsx');
    expect(page).toMatch(/exactLicensePlate: true/);
  });

  it('does not create a second trip query system -- reuses useTripsList, TripsTable and useTripCostAnalytics', () => {
    const page = read('frontend/modules/trips/pages/VehicleTripHistoryPage.tsx');
    expect(page).toMatch(/useTripsList\(/);
    expect(page).toMatch(/<TripsTable/);
    expect(page).toMatch(/useTripCostAnalytics\(/);
  });

  it('the deep link is a dedicated route, matching the fuel/expense/maintenance convention', () => {
    const routes = read('frontend/modules/trips/routes/index.ts');
    expect(routes).toMatch(
      /vehicleHistory: \(licensePlate: string\) => `\/trips\/vehicles\/\$\{encodeURIComponent\(licensePlate\)\}`/
    );
  });

  it('VehicleDetailPage links to it', () => {
    const page = read('frontend/modules/vehicles/pages/VehicleDetailPage.tsx');
    expect(page).toMatch(/TRIP_ROUTES\.vehicleHistory\(vehicle\.license_plate\)/);
  });

  it("the Recent Activity timeline's own trip query is also exact-matched", () => {
    const timeline = read('frontend/modules/vehicles/components/operations/VehicleActivityTimeline.tsx');
    expect(timeline).toMatch(/exactLicensePlate: true/);
  });

  it('a failed fetch is wired distinctly from an honest empty trip history', () => {
    const page = read('frontend/modules/trips/pages/VehicleTripHistoryPage.tsx');
    expect(page).toMatch(/isError=\{isError\}/);
    expect(page).toMatch(/onRetry=\{\(\) => refetch\(\)\}/);
  });
});
