// tests/security/workorder-reporting-permissions.spec.ts
//
// WAVE 3, R.3.6 -- Work Order Reporting.
//
// Pins the permission model for the new stats endpoint and the role
// matrix the R.3.6 audit found in server/permissions/roles.ts:
//
//   1. GET /api/workorders/stats requires Permission.WORKORDER_VIEW --
//      the SAME permission as GET /api/workorders (list) and GET
//      /api/workorders/[id] (get). An aggregate view is not a lower-
//      sensitivity read than the row list it summarizes, so it is not
//      gated any more loosely -- pinned by reading the route source
//      directly (source-conformance, matching this test suite's own
//      convention elsewhere) rather than only asserting the role
//      matrix, since the actual enforcement lives in the route/withAuth
//      wiring, not the permission table alone.
//
//   2. WORKORDER_VIEW and REPORT_VIEW are two independent permissions
//      that do NOT imply each other for every role -- the exact shape
//      of gap R.3.1 fixed for EXPENSE_VIEW/FUEL_VIEW vs
//      ANALYTICS_VIEW+REPORT_VIEW. DEPARTMENT_MANAGER/SUPERVISOR/
//      ACCOUNTANT/AUDITOR/VIEWER hold REPORT_VIEW (so they can reach
//      /reports/workorders) without WORKORDER_VIEW (so the stats call
//      itself 403s) -- WorkOrderReports.tsx's isForbiddenError-driven
//      Restricted state exists precisely for these roles. This test
//      pins the role matrix so a future permission change can't
//      silently widen or narrow it without a test noticing.

import { readFileSync } from 'fs';
import { join } from 'path';
import { Role, rolePermissions, Permission } from '../../server/permissions/roles';
import { hasAnyPermission, AuthContext } from '../../server/auth/auth-context';

function ctx(roles: Role[]): AuthContext {
  const permissions = Array.from(new Set(roles.flatMap((r) => rolePermissions[r])));
  return {
    userId: 'u1',
    tenantId: 'org1',
    roles,
    permissions,
    canBypassRbac: false,
    isPlatformAdmin: false,
    isSuperAdmin: false,
  };
}

describe('GET /api/workorders/stats route wiring', () => {
  it('is gated by Permission.WORKORDER_VIEW, the same permission as list/get', () => {
    const source = readFileSync(join(__dirname, '../../app/api/workorders/stats/route.ts'), 'utf-8');
    expect(source).toMatch(/permission:\s*Permission\.WORKORDER_VIEW/);
    expect(source).toMatch(/withAuth\(/);
  });

  it('the underlying controller method resolves a full TenantContext (org-unit scope), not a bare tenantId', () => {
    const source = readFileSync(join(__dirname, '../../modules/workorders/controllers/workorder.controller.ts'), 'utf-8');
    const statsFn = source.slice(source.indexOf('async stats('));
    expect(statsFn.slice(0, statsFn.indexOf('\n  }'))).toMatch(/resolveTenantContext\(req\)/);
  });
});

describe('work order visibility role matrix (WORKORDER_VIEW)', () => {
  it.each([Role.BRANCH_MANAGER, Role.FLEET_MANAGER, Role.WORKSHOP_MANAGER, Role.MECHANIC])(
    '%s holds WORKORDER_VIEW',
    (role) => {
      expect(rolePermissions[role]).toContain(Permission.WORKORDER_VIEW);
    }
  );

  it.each([Role.DEPARTMENT_MANAGER, Role.SUPERVISOR, Role.ACCOUNTANT, Role.AUDITOR, Role.VIEWER, Role.DISPATCHER, Role.DRIVER])(
    '%s does NOT hold WORKORDER_VIEW',
    (role) => {
      expect(rolePermissions[role]).not.toContain(Permission.WORKORDER_VIEW);
    }
  );
});

describe('REPORT_VIEW does not imply WORKORDER_VIEW (the Restricted-state gap WorkOrderReports.tsx handles)', () => {
  it('a role holding REPORT_VIEW without WORKORDER_VIEW can reach /reports/* but must see the stats endpoint 403', () => {
    // DEPARTMENT_MANAGER: holds REPORT_VIEW (reaches the Reports section)
    // but not WORKORDER_VIEW (the stats call itself will 403).
    const context = ctx([Role.DEPARTMENT_MANAGER]);
    expect(hasAnyPermission(context, [Permission.REPORT_VIEW])).toBe(true);
    expect(hasAnyPermission(context, [Permission.WORKORDER_VIEW])).toBe(false);
  });

  it('a role holding WORKORDER_VIEW without REPORT_VIEW cannot reach /reports/* at all (pre-existing layout gate, out of R.3.6 scope)', () => {
    const context = ctx([Role.MECHANIC]);
    expect(hasAnyPermission(context, [Permission.WORKORDER_VIEW])).toBe(true);
    expect(hasAnyPermission(context, [Permission.REPORT_VIEW])).toBe(false);
  });

  it.each([Role.BRANCH_MANAGER, Role.FLEET_MANAGER, Role.WORKSHOP_MANAGER])(
    '%s holds both -- the fully-authorized path',
    (role) => {
      const context = ctx([role]);
      expect(hasAnyPermission(context, [Permission.REPORT_VIEW])).toBe(true);
      expect(hasAnyPermission(context, [Permission.WORKORDER_VIEW])).toBe(true);
    }
  );
});
