// tests/security/permission-symmetry.spec.ts
//
// "A role that can DELETE a record must be able to EDIT it."
//
// ---------------------------------------------------------------------
// WHY THIS IS A SECURITY TEST AND NOT A TIDINESS ONE
// ---------------------------------------------------------------------
// ROLE_PERMISSIONS carries an explicit policy note: "DELETE FOLLOWS
// CREATE+EDIT WITHIN SCOPE -- a role that can create and edit a record
// must be able to remove one entered in error; otherwise every typo
// escalates to an organization admin."
//
// Two roles violated the precondition of their own policy.
// `branch_manager` and `accountant` both held FUEL_CREATE and
// FUEL_DELETE and NOT FUEL_EDIT. So the only way either of them could
// correct a mistyped litre count -- or a fuel log attributed to the
// wrong driver, which is now correctable for the first time -- was to
// DELETE the record and enter it again.
//
// That is not a smaller privilege than editing, it is a larger and more
// destructive one:
//
//   * the record's audit history is lost, rather than amended;
//   * its allocation-ledger posting is orphaned, and the ledger is
//     APPEND-ONLY, so the posting then has to be reversed by a human who
//     first notices;
//   * the replacement record gets a new id, so anything referencing the
//     original (a trip link, an attention item's evidence) points at
//     nothing.
//
// Granting EDIT to a role that already holds DELETE cannot weaken
// anything, because delete strictly dominates edit. The asymmetry made
// the shipped policy false; this asserts it stays true.

import { Role, Permission, permissionService } from '../../server/permissions/roles';

/** Resources whose create/edit/delete triple is a matched set. */
const RESOURCES = [
  'fuel',
  'expense',
  'trip',
  'maintenance',
  'vehicle',
  'workorder',
  'inventory',
] as const;

const ROLES = Object.values(Role) as string[];
const PERMISSIONS = new Set(Object.values(Permission) as string[]);

function has(role: string, permission: string): boolean {
  if (!PERMISSIONS.has(permission)) return false;
  return permissionService.hasPermission([role], permission as Permission);
}

describe('no role can destroy a record it cannot correct', () => {
  it('enumerated the roles (a vacuous pass is the failure mode)', () => {
    expect(ROLES.length).toBeGreaterThanOrEqual(10);
  });

  const cases = ROLES.flatMap((role) => RESOURCES.map((resource) => [role, resource] as const));

  it.each(cases)('%s / %s', (role, resource) => {
    const canDelete = has(role, `${resource}:delete`);
    const canEdit = has(role, `${resource}:edit`);

    // Named in the failure so the message says WHICH role and WHICH
    // resource, not merely "expected false to be true".
    expect({ role, resource, deleteWithoutEdit: canDelete && !canEdit }).toEqual({
      role,
      resource,
      deleteWithoutEdit: false,
    });
  });
});

describe('the two roles that were asymmetric', () => {
  it('branch_manager can now correct a fuel log rather than only delete it', () => {
    expect(has('branch_manager', Permission.FUEL_EDIT)).toBe(true);
    expect(has('branch_manager', Permission.FUEL_DELETE)).toBe(true);
  });

  it('accountant can now correct a fuel log rather than only delete it', () => {
    expect(has('accountant', Permission.FUEL_EDIT)).toBe(true);
    expect(has('accountant', Permission.FUEL_DELETE)).toBe(true);
  });

  it('REGRESSION: the grant did not widen anything else', () => {
    // The change must be exactly one permission per role. A role gaining
    // finance or org-management reach by accident is the failure this
    // guards.
    const forbiddenForBranchManager = [
      Permission.FINANCE_MANAGE,
      Permission.ORG_SETTINGS,
      Permission.PLATFORM_VIEW,
      Permission.PLATFORM_MANAGE,
      Permission.VEHICLE_DELETE,
    ];
    for (const permission of forbiddenForBranchManager) {
      expect({ permission, granted: has('branch_manager', permission) }).toEqual({
        permission,
        granted: false,
      });
    }

    const forbiddenForAccountant = [
      Permission.VEHICLE_CREATE,
      Permission.VEHICLE_EDIT,
      Permission.TRIP_CREATE,
      Permission.PLATFORM_VIEW,
    ];
    for (const permission of forbiddenForAccountant) {
      expect({ permission, granted: has('accountant', permission) }).toEqual({
        permission,
        granted: false,
      });
    }
  });
});

describe('read-only roles stay read-only', () => {
  // Restated here because a permission edit is exactly the change that
  // quietly grants a write to a role whose whole point is that it has
  // none.
  it.each(['viewer', 'auditor'])('%s holds no create, edit or delete', (role) => {
    const writes = (Object.values(Permission) as string[]).filter(
      (p) =>
        (p.endsWith(':create') || p.endsWith(':edit') || p.endsWith(':delete')) && has(role, p)
    );
    expect({ role, writePermissions: writes }).toEqual({ role, writePermissions: [] });
  });
});
