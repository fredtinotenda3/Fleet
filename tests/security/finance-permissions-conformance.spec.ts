// tests/security/finance-permissions-conformance.spec.ts
//
// Structural guards for the finance module's authorization surface.
//
// WHY THIS EXISTS
// ---------------
// The recurring failure in this codebase has not been a bad filter; it
// has been a read or write path added without anyone thinking about
// authorization at all, because forgetting is invisible. The finance
// module makes that worse in one specific way: its endpoints write and
// read MONEY, and a mis-gated finance route does not throw -- it just
// lets the wrong role restate a cost figure.
//
// So the least-privilege split decided for this pass is asserted here
// rather than left as a comment: ACCOUNTANT holds both finance
// permissions, BRANCH_MANAGER holds read only. If someone later grants
// BRANCH_MANAGER write access, that is a legitimate product decision --
// but it should be a deliberate one that fails this test first, not a
// line added to a role array during an unrelated change.
//
// Filesystem-based for the route assertions, for the same reason
// module-scope-conformance.spec.ts is: importing a route pulls in the
// whole Next/Mongo dependency graph, and the property is structural.

import * as fs from 'fs';
import * as path from 'path';
import { Permission, Role, rolePermissions } from '../../server/permissions/roles';
import { getModuleScope, orgUnitScopedCollections } from '../../server/tenancy/module-scope.registry';

const ROOT = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** Route files under app/api/finance, relative to the repo root. */
function financeRouteFiles(dir = 'app/api/finance'): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...financeRouteFiles(rel));
    else if (entry.name === 'route.ts') out.push(rel);
  }
  return out;
}

describe('finance permissions exist and are least-privilege', () => {
  it('defines FINANCE_VIEW and FINANCE_MANAGE', () => {
    expect(Permission.FINANCE_VIEW).toBe('finance:view');
    expect(Permission.FINANCE_MANAGE).toBe('finance:manage');
  });

  it('grants ACCOUNTANT both read and write', () => {
    const perms = rolePermissions[Role.ACCOUNTANT];
    expect(perms).toContain(Permission.FINANCE_VIEW);
    expect(perms).toContain(Permission.FINANCE_MANAGE);
  });

  it('grants BRANCH_MANAGER read only -- NOT write', () => {
    const perms = rolePermissions[Role.BRANCH_MANAGER];
    expect(perms).toContain(Permission.FINANCE_VIEW);
    // Deliberate: posting depreciation, submitting GL figures and changing
    // the organization's reporting currency / FX policy are accounting
    // functions with organization-wide effect.
    expect(perms).not.toContain(Permission.FINANCE_MANAGE);
  });

  it('does not leak finance write access to operational roles', () => {
    for (const role of [Role.DISPATCHER, Role.DRIVER, Role.MECHANIC, Role.SUPERVISOR]) {
      const perms = rolePermissions[role] ?? [];
      expect(perms).not.toContain(Permission.FINANCE_MANAGE);
      expect(perms).not.toContain(Permission.FINANCE_VIEW);
    }
  });

  it('keeps finance permissions out of the platform-only set, so org owners retain them', () => {
    // ORGANIZATION_OWNER/ADMIN are granted every non-platform-only
    // permission. Finance is organization data, not platform
    // infrastructure, so both must be present for the owner.
    const ownerPerms = rolePermissions[Role.ORGANIZATION_OWNER];
    expect(ownerPerms).toContain(Permission.FINANCE_VIEW);
    expect(ownerPerms).toContain(Permission.FINANCE_MANAGE);
  });
});

describe('every finance route is permission-gated', () => {
  const routes = financeRouteFiles();

  it('found the expected route files', () => {
    expect(routes.length).toBe(8);
  });

  it.each(routes.map((r) => [r] as const))('%s wraps every handler in withAuth', (route) => {
    const src = read(route);
    const exportedVerbs = [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=/g)].map(
      (m) => m[1]
    );
    expect(exportedVerbs.length).toBeGreaterThan(0);

    // One withAuth per exported HTTP verb. An unwrapped export is an
    // unauthenticated, unauthorized endpoint.
    const withAuthCount = (src.match(/withAuth\(/g) ?? []).length;
    expect(withAuthCount).toBe(exportedVerbs.length);
  });

  it.each(routes.map((r) => [r] as const))(
    '%s gates on a FINANCE permission only',
    (route) => {
      const src = read(route);
      const permissions = [...src.matchAll(/Permission\.([A-Z_]+)/g)].map((m) => m[1]);
      expect(permissions.length).toBeGreaterThan(0);
      for (const permission of permissions) {
        expect(['FINANCE_VIEW', 'FINANCE_MANAGE']).toContain(permission);
      }
    }
  );

  it('gates every mutating verb on FINANCE_MANAGE, never FINANCE_VIEW', () => {
    for (const route of routes) {
      const src = read(route);
      // Match each `export const VERB = withAuth(...)` block up to the
      // next export (or EOF) so a file exporting both GET and POST is
      // checked per verb rather than as a whole.
      const blocks = src.split(/(?=export const (?:GET|POST|PUT|PATCH|DELETE)\s*=)/);
      for (const block of blocks) {
        const verbMatch = block.match(/export const (GET|POST|PUT|PATCH|DELETE)\s*=/);
        if (!verbMatch) continue;
        const verb = verbMatch[1];
        const isMutating = verb !== 'GET';
        const usesManage = block.includes('Permission.FINANCE_MANAGE');
        const usesView = block.includes('Permission.FINANCE_VIEW');

        if (isMutating) {
          expect({ route, verb, usesManage }).toEqual({ route, verb, usesManage: true });
          expect(usesView).toBe(false);
        } else {
          expect(usesManage).toBe(false);
        }
      }
    }
  });
});

describe('finance module is registered for org-unit scoping', () => {
  it('appears in the module scope registry as org-unit level', () => {
    const entry = getModuleScope('finance');
    expect(entry).toBeDefined();
    expect(entry!.level).toBe('org-unit');
    expect(entry!.orgUnitSource).toBe('vehicle');
  });

  it('is recorded as an OPEN decision (branch-vs-consolidated GL submissions)', () => {
    // Not a claim that unresolved is good -- a claim that it must stay
    // visible in `npm run tenancy:report` until product answers it,
    // rather than decaying into assumed fact.
    expect(getModuleScope('finance')!.confirmed).toBe(false);
  });

  it('declares all three finance collections as org-unit scoped', () => {
    const collections = orgUnitScopedCollections();
    expect(collections).toContain('tblallocationledger');
    expect(collections).toContain('tbldepreciationprofiles');
    expect(collections).toContain('tblglsubmissions');
  });
});

describe('finance write paths never trust a caller-supplied orgUnitId', () => {
  // The write-side scope escalation this module is most exposed to:
  // accepting orgUnitId from the request body would let a branch-scoped
  // caller post a cost against another branch's vehicle and stamp their
  // own scope on it. Asserted structurally because it is a property of
  // how the services are written, and a regression would be a one-line
  // convenience change during an unrelated edit.

  it('the finance request schemas do not accept an orgUnitId field', () => {
    const schema = read('shared/validations/finance.schema.ts');
    expect(schema).not.toMatch(/orgUnitId/);
  });

  it('the allocation service derives orgUnitId from a scope-checked vehicle', () => {
    const src = read('modules/finance/services/allocation.service.ts');
    expect(src).toContain('resolveVehicleInScope');
    expect(src).toContain('orgUnitId: vehicle.orgUnitId');
  });

  it('the depreciation service scope-checks the vehicle before writing a profile or charge', () => {
    const src = read('modules/finance/services/depreciation.service.ts');
    expect(src).toContain('resolveVehicleInScope');
    expect(src).toContain('accessibleOrgUnitIds');
  });

  it('the GL submission service uses resolveCreationOrgUnitId rather than a body field', () => {
    const src = read('modules/finance/services/gl-reconciliation.service.ts');
    expect(src).toContain('resolveCreationOrgUnitId(context, undefined)');
  });
});
