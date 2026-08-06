// tests/security/org-unit-isolation.spec.ts
//
// Proves the SECOND isolation guarantee, the one the hierarchy exists
// for:
//
//     Branch A can never see Branch B's data, inside the same organization.
//
// tenant-isolation.spec.ts already proves organization-vs-organization
// separation. That is the coarse boundary and it was the source of the
// original production leak. This file covers the finer one: two users of
// the SAME customer, scoped to different org units.
//
// The distinction matters because the two are enforced by different
// code. Organization separation lives in BaseRepository.getTenantFilter()
// and applies to every query automatically. Org-unit separation lives in
// tenantScopeService.buildFilter() and applies only where a developer
// remembered to call it -- which is exactly why it needs per-module
// tests rather than one generic test.
//
// Runs against tests/helpers/fake-collection.ts, so no mongod binary.

import { TenantScopedRepository } from '../../server/repositories/tenant-scoped.repository';
import { tenantScopeService } from '../../modules/tenancy/services/tenant-scope.service';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import { FakeCollection } from '../helpers/fake-collection';

const ORG = '68a1f2c4e5b7a9d3c1f04a11';
const OTHER_ORG = '68a1f2c4e5b7a9d3c1f04b22';

// A realistic slice of the requested ladder:
//   Harare Branch
//     +-- Logistics Department
//           +-- Central Workshop
//                 +-- Heavy Fleet
//   Bulawayo Branch
const HARARE = 'unit-harare-branch';
const LOGISTICS = 'unit-logistics-dept';
const WORKSHOP = 'unit-central-workshop';
const HEAVY_FLEET = 'unit-heavy-fleet';
const BULAWAYO = 'unit-bulawayo-branch';

const collection = new FakeCollection();

class ScopedTestRepository extends TenantScopedRepository<any> {
  protected collectionName = 'tbltest';
  protected async getCollection(): Promise<any> {
    return collection as unknown as any;
  }
}

const repo = new ScopedTestRepository();

/**
 * Builds the context a real request would carry.
 *
 * `accessibleOrgUnitIds` is the already-expanded closure (unit +
 * descendants) that TenantContextService produces -- these tests supply
 * it directly so a failure points at the repository wiring rather than
 * at context resolution, which has its own tests.
 */
function contextFor(
  accessibleOrgUnitIds: string[] | null,
  organizationId: string = ORG
): TenantContext {
  return {
    organizationId,
    organizationName: 'Test Org',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  };
}

/** A branch manager sees their branch and everything beneath it. */
const harareManager = contextFor([HARARE, LOGISTICS, WORKSHOP, HEAVY_FLEET]);
/** A workshop manager sees only the workshop subtree. */
const workshopManager = contextFor([WORKSHOP, HEAVY_FLEET]);
/** The other branch. */
const bulawayoManager = contextFor([BULAWAYO]);
/** An org owner: unrestricted within the organization. */
const orgOwner = contextFor(null);
/** A scoped user whose assignments resolved to nothing. */
const unassigned = contextFor([]);

beforeEach(() => {
  collection.seenFilters = [];
  collection.seed([
    { tenantId: ORG, orgUnitId: HARARE, ref: 'harare-1', isDeleted: false },
    { tenantId: ORG, orgUnitId: LOGISTICS, ref: 'logistics-1', isDeleted: false },
    { tenantId: ORG, orgUnitId: WORKSHOP, ref: 'workshop-1', isDeleted: false },
    { tenantId: ORG, orgUnitId: HEAVY_FLEET, ref: 'fleet-1', isDeleted: false },
    { tenantId: ORG, orgUnitId: BULAWAYO, ref: 'bulawayo-1', isDeleted: false },
    { tenantId: ORG, orgUnitId: BULAWAYO, ref: 'bulawayo-2', isDeleted: false },
    // Legacy row predating the orgUnitId field.
    { tenantId: ORG, ref: 'unassigned-legacy', isDeleted: false },
    // Another customer entirely.
    { tenantId: OTHER_ORG, orgUnitId: HARARE, ref: 'other-org-1', isDeleted: false },
  ]);
});

function refs(rows: Array<Record<string, unknown>>): string[] {
  return rows.map((r) => String(r.ref)).sort();
}

describe('branch-level read isolation', () => {
  it('a branch manager sees their branch subtree and nothing else', async () => {
    const rows = await repo.findManyInScope({}, harareManager);
    expect(refs(rows)).toEqual(['fleet-1', 'harare-1', 'logistics-1', 'workshop-1']);
  });

  it('the other branch manager sees only their own branch', async () => {
    const rows = await repo.findManyInScope({}, bulawayoManager);
    expect(refs(rows)).toEqual(['bulawayo-1', 'bulawayo-2']);
  });

  it('a workshop manager sees strictly less than their branch manager', async () => {
    const rows = await repo.findManyInScope({}, workshopManager);
    expect(refs(rows)).toEqual(['fleet-1', 'workshop-1']);
    // Explicitly: the parent branch's own rows are NOT visible downward.
    expect(refs(rows)).not.toContain('harare-1');
  });

  it('an org owner sees every unit in their organization', async () => {
    const rows = await repo.findManyInScope({}, orgOwner);
    // Includes the legacy row with no orgUnitId, and excludes the other
    // organization -- tenant scoping still applies underneath.
    expect(refs(rows)).toEqual([
      'bulawayo-1',
      'bulawayo-2',
      'fleet-1',
      'harare-1',
      'logistics-1',
      'unassigned-legacy',
      'workshop-1',
    ]);
  });

  it('never crosses the organization boundary, whatever the unit scope', async () => {
    // ORG and OTHER_ORG both have a row tagged HARARE. Org-unit scoping
    // must not be able to reach it: tenant scoping is the outer filter.
    const rows = await repo.findManyInScope({}, harareManager);
    expect(refs(rows)).not.toContain('other-org-1');
  });
});

describe('fail-closed behaviour', () => {
  it('a scoped user with no accessible units sees nothing', async () => {
    // The critical direction. A user whose assignments were revoked or
    // whose units were deleted must see ZERO rows, not the whole
    // organization. `buildFilter` returns { orgUnitId: { $in: [] } }.
    const rows = await repo.findManyInScope({}, unassigned);
    expect(rows).toHaveLength(0);
  });

  it('an empty scope produces a predicate that matches nothing, not an absent predicate', () => {
    const filter = tenantScopeService.buildFilter(unassigned, 'orgUnitId');
    expect(filter).toEqual({ orgUnitId: { $in: [] } });
  });

  it('an unrestricted scope produces no org-unit predicate at all', () => {
    expect(tenantScopeService.buildFilter(orgOwner, 'orgUnitId')).toEqual({});
  });

  it('legacy rows with no orgUnitId are invisible to scoped users, not universally visible', async () => {
    // The deliberate backward-compatibility trade-off. An unbackfilled
    // row is hidden from scope-narrowed users rather than leaking to
    // everyone. Documented here so it is a tested decision, not a
    // surprise discovered in production.
    const rows = await repo.findManyInScope({}, harareManager);
    expect(refs(rows)).not.toContain('unassigned-legacy');

    const ownerRows = await repo.findManyInScope({}, orgOwner);
    expect(refs(ownerRows)).toContain('unassigned-legacy');
  });
});

describe('caller filters cannot widen org-unit scope', () => {
  it('an explicit orgUnitId in the caller filter cannot reach another branch', async () => {
    const rows = await repo.findManyInScope(
      { orgUnitId: BULAWAYO } as any,
      harareManager
    );
    // The scope filter is spread AFTER the caller filter, so it wins.
    expect(refs(rows)).not.toContain('bulawayo-1');
    expect(refs(rows)).not.toContain('bulawayo-2');
  });

  it('a $in widening attempt cannot reach another branch', async () => {
    const rows = await repo.findManyInScope(
      { orgUnitId: { $in: [HARARE, BULAWAYO] } } as any,
      harareManager
    );
    expect(refs(rows)).not.toContain('bulawayo-1');
  });
});

describe('paginated reads are scoped identically to list reads', () => {
  // The trap the original five modules fell into was a scoped list and
  // an unscoped everything-else. Pagination totals leak counts even when
  // rows are hidden, so the total is asserted, not just the page.
  it('totals reflect the scope, not the organization', async () => {
    const page = await repo.findWithPaginationInScope(
      {},
      { page: 1, limit: 50 },
      bulawayoManager
    );
    expect(page.pagination.total).toBe(2);
    expect(refs(page.data)).toEqual(['bulawayo-1', 'bulawayo-2']);
  });

  it('an unassigned user gets a zero total, not the organization total', async () => {
    const page = await repo.findWithPaginationInScope(
      {},
      { page: 1, limit: 50 },
      unassigned
    );
    expect(page.pagination.total).toBe(0);
  });
});

describe('canAccessOrgUnit gate', () => {
  it('permits a unit inside the caller scope', () => {
    expect(tenantScopeService.canAccessOrgUnit(harareManager, LOGISTICS)).toBe(true);
  });

  it('refuses a unit outside the caller scope', () => {
    expect(tenantScopeService.canAccessOrgUnit(harareManager, BULAWAYO)).toBe(false);
  });

  it('refuses everything for an unassigned user', () => {
    expect(tenantScopeService.canAccessOrgUnit(unassigned, HARARE)).toBe(false);
  });

  it('permits everything for an unrestricted role', () => {
    expect(tenantScopeService.canAccessOrgUnit(orgOwner, BULAWAYO)).toBe(true);
  });
});
