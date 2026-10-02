// tests/security/attention-triage-permission-scope.spec.ts
//
// ROUND 5 (real-fleet acceptance audit) -- the security-isolation audit
// flagged that POST /api/ai/needs-attention/:id/resolve and .../verify-
// outcome were gated on Permission.ANALYTICS_VIEW alone. VIEWER (whose
// entire point is to be read-only) and AUDITOR (independent oversight
// over the very attention items being triaged) both hold ANALYTICS_VIEW,
// so either role could mark a finding resolved or verify its own
// outcome -- a mutation of triage state, and for AUDITOR specifically a
// textbook separation-of-duties violation (the auditor marking their own
// audit subject resolved).
//
// FIX: a new Permission.ANALYTICS_MANAGE (server/permissions/roles.ts),
// granted to the same operational manager/accountant roles that already
// hold ANALYTICS_VIEW, withheld from VIEWER and AUDITOR -- mirroring the
// FINANCE_VIEW/FINANCE_MANAGE split already established in that file.
// Both routes now require ANALYTICS_MANAGE instead.
//
// This pins the fix the same two ways the codebase already uses for
// this bug class: a static-inspection check on the route files (so a
// future edit that quietly reverts to ANALYTICS_VIEW is caught even
// without exercising withAuth's runtime plumbing) and a behavioral
// check against the real rolePermissions table.

import fs from 'fs';
import path from 'path';
import { Role, Permission, permissionService } from '@/server/permissions/roles';

function readRouteSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('needs-attention resolve/verify-outcome routes require ANALYTICS_MANAGE', () => {
  it.each([
    'app/api/ai/needs-attention/[id]/resolve/route.ts',
    'app/api/ai/needs-attention/[id]/verify-outcome/route.ts',
  ])('%s is gated on ANALYTICS_MANAGE, not ANALYTICS_VIEW', (routePath) => {
    const source = readRouteSource(routePath);
    expect(source).toMatch(/permission:\s*Permission\.ANALYTICS_MANAGE/);
    // REGRESSION: catches a careless revert far more directly than
    // re-deriving the same string match would.
    expect(source).not.toMatch(/permission:\s*Permission\.ANALYTICS_VIEW/);
  });

  // The sibling read route must NOT have been widened by accident -- it
  // is a plain scoped read of already-resolved items, not a mutation.
  it('the resolved-items READ route still only requires ANALYTICS_VIEW', () => {
    const source = readRouteSource('app/api/ai/needs-attention/resolved/route.ts');
    expect(source).toMatch(/permission:\s*Permission\.ANALYTICS_VIEW/);
  });
});

describe('ANALYTICS_MANAGE: read-only and oversight roles stay unable to mutate attention triage', () => {
  it.each([Role.VIEWER, Role.AUDITOR])('%s does NOT hold ANALYTICS_MANAGE', (role) => {
    expect(permissionService.hasPermission([role], Permission.ANALYTICS_MANAGE)).toBe(false);
  });

  it.each([Role.VIEWER, Role.AUDITOR])(
    '%s still holds ANALYTICS_VIEW, so the feed itself stays visible',
    (role) => {
      expect(permissionService.hasPermission([role], Permission.ANALYTICS_VIEW)).toBe(true);
    }
  );

  it.each([
    Role.BRANCH_MANAGER,
    Role.DEPARTMENT_MANAGER,
    Role.FLEET_MANAGER,
    Role.WORKSHOP_MANAGER,
    Role.ACCOUNTANT,
  ])('%s (operational, already held ANALYTICS_VIEW) gains ANALYTICS_MANAGE', (role) => {
    expect(permissionService.hasPermission([role], Permission.ANALYTICS_MANAGE)).toBe(true);
  });

  it.each([Role.SUPER_ADMIN, Role.ORGANIZATION_OWNER, Role.ORGANIZATION_ADMIN])(
    '%s holds ANALYTICS_MANAGE',
    (role) => {
      expect(permissionService.hasPermission([role], Permission.ANALYTICS_MANAGE)).toBe(true);
    }
  );

  it('roles that never held ANALYTICS_VIEW still do not hold ANALYTICS_MANAGE either', () => {
    for (const role of [Role.SUPERVISOR, Role.DISPATCHER, Role.DRIVER, Role.MECHANIC]) {
      expect(permissionService.hasPermission([role], Permission.ANALYTICS_MANAGE)).toBe(false);
    }
  });
});
