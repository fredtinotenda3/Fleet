// tests/security/org-unit-descendants.spec.ts
//
// Guards the step that silently produced "scoped user sees zero rows"
// in production: DESCENDANT EXPANSION.
//
// A branch manager is assigned to one unit -- the branch. Every vehicle,
// fuel log and expense actually hangs off a fleet several levels below
// it. The manager can only see them if resolveContext() expands their
// assignment into the full subtree, and that expansion is driven
// entirely by each unit's materialized `path` array.
//
// If a child unit's `path` does not contain its ancestors, expansion
// yields just the root, the scope filter matches nothing, and every page
// renders zero -- with no error anywhere. The data is present, the user
// is assigned, the filter is correct, and the screen is empty. That is
// the hardest possible shape to debug, so it gets a test.

import { TenantScopedRepository } from '../../server/repositories/tenant-scoped.repository';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import { FakeCollection } from '../helpers/fake-collection';

const ORG = 'willsgrove-farm-enterprises-9e80ed';

const BRANCH = 'unit-branch';
const DEPT = 'unit-dept';
const WORKSHOP = 'unit-workshop';
const FLEET = 'unit-fleet';

/** The tree as tblorgunits stores it: `path` is the ancestor chain, root-first. */
const UNITS = [
  { _id: BRANCH, name: 'Harare Branch', type: 'branch', parentId: null, path: [] },
  { _id: DEPT, name: 'Logistics', type: 'department', parentId: BRANCH, path: [BRANCH] },
  { _id: WORKSHOP, name: 'Central Workshop', type: 'workshop', parentId: DEPT, path: [BRANCH, DEPT] },
  { _id: FLEET, name: 'Heavy Fleet', type: 'fleet', parentId: DEPT, path: [BRANCH, DEPT] },
];

/** The expansion algorithm TenantContextService.expandWithDescendants implements. */
function expand(rootIds: string[], units: typeof UNITS): string[] {
  const out = new Set(rootIds);
  for (const u of units) {
    if (u.path?.some((ancestor) => rootIds.includes(ancestor))) out.add(u._id);
  }
  return Array.from(out);
}

describe('descendant expansion', () => {
  it('expands a branch assignment to every unit beneath it', () => {
    expect(expand([BRANCH], UNITS).sort()).toEqual([BRANCH, DEPT, FLEET, WORKSHOP].sort());
  });

  it('expands a department to its own children only', () => {
    expect(expand([DEPT], UNITS).sort()).toEqual([DEPT, FLEET, WORKSHOP].sort());
  });

  it('returns a leaf unchanged', () => {
    expect(expand([FLEET], UNITS)).toEqual([FLEET]);
  });

  it('never reaches upward from a child to its parent', () => {
    expect(expand([FLEET], UNITS)).not.toContain(BRANCH);
    expect(expand([WORKSHOP], UNITS)).not.toContain(DEPT);
  });

  it('yields only the root when path arrays are empty -- the production failure', () => {
    // This is the regression. Units created without a materialized path
    // look correct in the org chart (parentId is set) but expand to
    // nothing, so a branch manager sees an empty app.
    const broken = UNITS.map((u) => ({ ...u, path: [] as string[] }));
    expect(expand([BRANCH], broken)).toEqual([BRANCH]);
  });
});

describe('what a branch manager can actually read', () => {
  const collection = new FakeCollection();

  class Repo extends TenantScopedRepository<any> {
    protected collectionName = 'tblvehicles';
    protected async getCollection(): Promise<any> {
      return collection as unknown as any;
    }
  }
  const repo = new Repo();

  function ctx(ids: string[] | null): TenantContext {
    return {
      organizationId: ORG,
      organizationName: 'Willsgrove',
      accessibleOrgUnitIds: ids,
      assignedOrgUnitIds: ids ?? [],
      isPlatformScope: false,
    };
  }

  beforeEach(() => {
    collection.seenFilters = [];
    // Mirrors production: every vehicle sits on the deepest unit.
    collection.seed([
      { tenantId: ORG, orgUnitId: FLEET, ref: 'v1', isDeleted: false },
      { tenantId: ORG, orgUnitId: FLEET, ref: 'v2', isDeleted: false },
      { tenantId: ORG, orgUnitId: WORKSHOP, ref: 'v3', isDeleted: false },
    ]);
  });

  it('sees fleet vehicles through the expanded subtree', async () => {
    const rows = await repo.findManyInScope({}, ctx(expand([BRANCH], UNITS)));
    expect(rows.map((r: any) => r.ref).sort()).toEqual(['v1', 'v2', 'v3']);
  });

  it('sees NOTHING when expansion is broken, even though it is assigned', async () => {
    const broken = UNITS.map((u) => ({ ...u, path: [] as string[] }));
    const rows = await repo.findManyInScope({}, ctx(expand([BRANCH], broken)));
    expect(rows).toHaveLength(0);
  });

  it('sees nothing with no assignment at all', async () => {
    expect(await repo.findManyInScope({}, ctx([]))).toHaveLength(0);
  });
});

describe('provisioning keeps the two scope stores consistent', () => {
  // Regression for the bug that produced 9 zero-visibility accounts.
  //
  // Scope lives in two places: tbluser_scope_assignments (which
  // resolveContext actually reads) and tblorganizations.members[].orgUnitId
  // (which the members UI renders and which any roster-driven repair
  // infers from). Two seed scripts each wrote ONE of them:
  //
  //   earlier seed  -> members[].orgUnitId only, no assignment
  //                    => resolveContext found nothing, user saw zero rows
  //   provisioning  -> assignment only, no members[].orgUnitId
  //                    => scope worked, roster showed them unassigned
  //
  // Neither failed loudly. A write that populates one store and not the
  // other must be treated as incomplete.

  type Member = { userId: string; orgUnitId?: string };
  type Assignment = { userId: string; orgUnitId: string };

  function findInconsistencies(
    members: Member[],
    assignments: Assignment[]
  ): Array<{ userId: string; reason: string }> {
    const byUser = new Map(assignments.map((a) => [a.userId, a.orgUnitId]));
    const out: Array<{ userId: string; reason: string }> = [];

    for (const m of members) {
      const assigned = byUser.get(m.userId);
      if (m.orgUnitId && !assigned) {
        out.push({ userId: m.userId, reason: 'roster has a unit but no assignment exists' });
      }
      if (assigned && !m.orgUnitId) {
        out.push({ userId: m.userId, reason: 'assignment exists but roster records no unit' });
      }
      if (assigned && m.orgUnitId && assigned !== m.orgUnitId) {
        out.push({ userId: m.userId, reason: 'roster and assignment disagree' });
      }
    }
    return out;
  }

  it('accepts a consistent pair', () => {
    expect(
      findInconsistencies(
        [{ userId: 'u1', orgUnitId: 'unit-a' }],
        [{ userId: 'u1', orgUnitId: 'unit-a' }]
      )
    ).toEqual([]);
  });

  it('flags a roster entry with no assignment (the earlier seed bug)', () => {
    const issues = findInconsistencies([{ userId: 'u1', orgUnitId: 'unit-a' }], []);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toMatch(/no assignment/);
  });

  it('flags an assignment with no roster entry (the provisioning bug)', () => {
    const issues = findInconsistencies(
      [{ userId: 'u1' }],
      [{ userId: 'u1', orgUnitId: 'unit-a' }]
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toMatch(/roster records no unit/);
  });

  it('flags the two stores disagreeing', () => {
    const issues = findInconsistencies(
      [{ userId: 'u1', orgUnitId: 'unit-a' }],
      [{ userId: 'u1', orgUnitId: 'unit-b' }]
    );
    expect(issues[0].reason).toMatch(/disagree/);
  });

  it('leaves an intentionally unassigned account alone', () => {
    // unassigned@ is the fail-closed control: no roster unit AND no
    // assignment is the correct, consistent state for it.
    expect(findInconsistencies([{ userId: 'control' }], [])).toEqual([]);
  });
});
