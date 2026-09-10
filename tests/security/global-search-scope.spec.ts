// tests/security/global-search-scope.spec.ts
//
// A search box is a cross-cutting read, and cross-cutting reads are
// exactly where scope leaks have come back in this codebase -- twice, on
// aggregates. So the rules are asserted rather than reviewed.
//
// Three properties, in order of how badly they fail:
//
//  1. ORG-UNIT SCOPE. Search must never surface a row the caller's LIST
//     hides. It applies the shared `tenantScopeService.buildFilter`
//     predicate, so it cannot drift from the lists.
//  2. PERMISSION PER SOURCE, checked BEFORE the query runs. A result the
//     user cannot open is an information leak dressed as a convenience.
//  3. TENANT AND SOFT-DELETE, on every source without exception.
//
// The service queries collections directly rather than going through six
// repositories with six different filter shapes, so these are the checks
// that make that decision safe.

const findMock = jest.fn();
const collectionMock = jest.fn();

jest.mock('../../infrastructure/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn(async () => ({ collection: collectionMock })),
}));

import { globalSearchService } from '../../modules/search/services/global-search.service';
import { Permission, Role } from '../../server/permissions/roles';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const HARARE = 'branch-harare';
const BULAWAYO = 'branch-bulawayo';

function context(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: ORG,
    organizationName: 'Willsgrove',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as TenantContext;
}

/** Every filter handed to Mongo during the last search call. */
let capturedFilters: Array<{ collection: string; filter: Record<string, unknown> }> = [];

beforeEach(() => {
  capturedFilters = [];
  findMock.mockReset();
  collectionMock.mockReset();

  collectionMock.mockImplementation((name: string) => ({
    find: (filter: Record<string, unknown>) => {
      capturedFilters.push({ collection: name, filter });
      return { limit: () => ({ toArray: async () => [] }) };
    },
  }));
});

describe('every source query is scoped', () => {
  it('applies the tenant, soft-delete and org-unit filters to ALL of them', async () => {
    await globalSearchService.search('AFU', context([HARARE]), [Role.ORGANIZATION_ADMIN]);

    expect(capturedFilters.length).toBeGreaterThanOrEqual(6);

    for (const { collection, filter } of capturedFilters) {
      expect({ collection, tenantId: filter.tenantId }).toEqual({ collection, tenantId: ORG });
      expect({ collection, isDeleted: filter.isDeleted }).toEqual({
        collection,
        isDeleted: { $ne: true },
      });
      // The shared predicate's narrowed form. If this were absent, search
      // would return rows the caller's own list refuses to show.
      expect({ collection, orgUnitId: filter.orgUnitId }).toEqual({
        collection,
        orgUnitId: { $in: [HARARE] },
      });
    }
  });

  it('an org-wide caller gets no org-unit clause, exactly as buildFilter emits', async () => {
    await globalSearchService.search('AFU', context(null), [Role.ORGANIZATION_ADMIN]);

    for (const { collection, filter } of capturedFilters) {
      expect({ collection, hasOrgUnitClause: 'orgUnitId' in filter }).toEqual({
        collection,
        hasOrgUnitClause: false,
      });
    }
  });

  it('FAILS CLOSED for a caller whose assignments resolved to nothing', async () => {
    // `{$in: []}` matches no document. A search that quietly widened here
    // would be the most privileged read in the product, available to the
    // least privileged user.
    await globalSearchService.search('AFU', context([]), [Role.ORGANIZATION_ADMIN]);

    for (const { collection, filter } of capturedFilters) {
      expect({ collection, orgUnitId: filter.orgUnitId }).toEqual({
        collection,
        orgUnitId: { $in: [] },
      });
    }
  });

  it('never queries a collection outside the declared set', async () => {
    await globalSearchService.search('AFU', context(null), [Role.ORGANIZATION_ADMIN]);
    const collections = new Set(capturedFilters.map((c) => c.collection));
    expect([...collections].sort()).toEqual([
      'tbldrivers',
      'tblexpenses',
      'tblreminders',
      'tbltrips',
      'tblvehicles',
      'tblworkorders',
    ]);
  });
});

describe('permission is checked before the query runs', () => {
  it('a driver searches only what a driver can read', async () => {
    // `driver` holds VEHICLE_VIEW and MAINTENANCE_VIEW but not
    // TRIP_VIEW, WORKORDER_VIEW or EXPENSE_VIEW.
    const response = await globalSearchService.search('AFU', context(null), [Role.DRIVER]);

    const queried = new Set(capturedFilters.map((c) => c.collection));
    expect(queried.has('tblvehicles')).toBe(true);
    expect(queried.has('tblworkorders')).toBe(false);
    expect(queried.has('tblexpenses')).toBe(false);

    // And it SAYS so, rather than returning an empty list that reads as
    // "no such work order".
    expect(response.skipped).toEqual(expect.arrayContaining(['work-order', 'expense']));
  });

  it('a viewer searches nothing it cannot read, and no query escapes', async () => {
    const response = await globalSearchService.search('AFU', context(null), [Role.VIEWER]);
    const queried = new Set(capturedFilters.map((c) => c.collection));
    expect(queried.has('tblworkorders')).toBe(false);
    expect(response.skipped).toContain('work-order');
  });

  it('a caller with no roles at all queries nothing', async () => {
    const response = await globalSearchService.search('AFU', context(null), []);
    expect(capturedFilters).toEqual([]);
    expect(response.results).toEqual([]);
    expect(response.skipped.length).toBeGreaterThan(0);
  });
});

describe('the query itself', () => {
  it('does not run for a query shorter than two characters', async () => {
    // A single character matches most of a fleet; that is a listing, not
    // a search, and it would be an unpaginated one.
    for (const q of ['', ' ', 'a']) {
      capturedFilters = [];
      const response = await globalSearchService.search(q, context(null), [Role.ORGANIZATION_ADMIN]);
      expect({ q, queries: capturedFilters.length }).toEqual({ q, queries: 0 });
      expect(response.results).toEqual([]);
    }
  });

  it('escapes regex metacharacters instead of letting them run', async () => {
    // `.*` in a search box is a full table scan at best and a ReDoS at
    // worst.
    await globalSearchService.search('.*', context(null), [Role.ORGANIZATION_ADMIN]);
    const clause = capturedFilters[0].filter.$or as Array<Record<string, { $regex: string }>>;
    const firstField = Object.values(clause[0])[0];
    expect(firstField.$regex).toBe('\\.\\*');
  });

  it('searches each source across several fields', async () => {
    await globalSearchService.search('AFU', context(null), [Role.ORGANIZATION_ADMIN]);
    const vehicles = capturedFilters.find((c) => c.collection === 'tblvehicles')!;
    const fields = (vehicles.filter.$or as Array<Record<string, unknown>>).map(
      (clause) => Object.keys(clause)[0]
    );
    expect(fields).toEqual(['license_plate', 'make', 'model', 'vin']);
  });
});

describe('the route is authenticated but carries no single permission', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../app/api/search/route.ts'),
    'utf8'
  );

  it('is wrapped in withAuth', () => {
    expect(src).toMatch(/withAuth\(/);
  });

  it('deliberately declares no route-level permission', () => {
    // One permission would be either too narrow (a driver could not find
    // a vehicle they may see) or too wide (six collections behind one
    // check). The gating is per source, in the service.
    expect(src).not.toMatch(/permission:\s*Permission\./);
    expect(src).toMatch(/permission/i);
  });

  it('the service gates each source on the permission its list enforces', () => {
    const service = fs.readFileSync(
      path.resolve(__dirname, '../../modules/search/services/global-search.service.ts'),
      'utf8'
    );
    for (const permission of [
      Permission.VEHICLE_VIEW,
      Permission.TRIP_VIEW,
      Permission.WORKORDER_VIEW,
      Permission.MAINTENANCE_VIEW,
      Permission.EXPENSE_VIEW,
    ]) {
      const constant = Object.entries(Permission).find(([, v]) => v === permission)?.[0];
      expect({ permission, declared: service.includes(`Permission.${constant}`) }).toEqual({
        permission,
        declared: true,
      });
    }
  });
});
