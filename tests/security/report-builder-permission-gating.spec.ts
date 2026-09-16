// tests/security/report-builder-permission-gating.spec.ts
//
// WAVE 3, R.3.7 -- Financial / Cost Intelligence Reporting.
//
// PREREQUISITE FIX pinned here, not new-feature scope: the Phase 1
// audit found the entire generic Report Builder execution path
// (app/api/reports/**, app/api/reporting/definitions/**, app/api/
// reporting/executions/**) gated ONLY by the blanket
// Permission.REPORT_VIEW/REPORT_CREATE/REPORT_DELETE -- confirmed by
// reading every route file and grepping report-definition.controller.ts,
// report-builder.service.ts, report-execution.controller.ts,
// report-execution.service.ts for any EXPENSE_VIEW/FUEL_VIEW/
// FINANCE_VIEW check (zero matches). A role holding only REPORT_VIEW
// (e.g. AUDITOR, DEPARTMENT_MANAGER) could already preview/export/
// schedule a report over `expenses` or `fuel` with no EXPENSE_VIEW/
// FUEL_VIEW check anywhere -- a pre-existing gap this delivery closes
// as a prerequisite for safely registering `allocations`, a strictly
// more sensitive source, through the same engine.
//
// Covers:
//   1. assertDataSourceAccess() itself: allow/deny/bypass/unregistered.
//   2. The retroactive fix is actually applied: expenses/fuel/
//      allocations carry the right requiredPermission; every
//      previously-unaffected source is left with none (unchanged
//      behaviour).
//   3. The pre-existing gap is reproduced and then shown closed: at
//      least one real role holds REPORT_VIEW without EXPENSE_VIEW/
//      FUEL_VIEW/FINANCE_VIEW, and assertDataSourceAccess denies that
//      exact role for the corresponding source.
//   4. Source-conformance: every AuthContext-available checkpoint
//      (preview, previewPivot, drilldown, create+schedule,
//      update+schedule, execution generate) actually calls the
//      assertion -- pinned by reading the controller/service source
//      directly, the same convention
//      tests/security/workorder-reporting-permissions.spec.ts and
//      tests/unit/reports/workorder-reports-wiring.spec.ts already
//      established for this codebase (Jest here runs testEnvironment:
//      'node', so these paths are not otherwise unit-testable without
//      a full Mongo double).

import { readFileSync } from 'fs';
import { join } from 'path';
import { Role, rolePermissions, Permission } from '../../server/permissions/roles';
import { AuthContext, hasAnyPermission } from '../../server/auth/auth-context';
import { ForbiddenError } from '../../server/errors/app.errors';
import { assertDataSourceAccess } from '../../modules/reporting/utils/data-source-authorization';
import { dataSourceRegistry } from '../../modules/reporting/registry/DataSourceRegistry';
import { bootstrapDataSources } from '../../modules/reporting/registry/bootstrap-data-sources';
import type { DataSourceKey } from '../../modules/reporting/types/data-source.types';

function ctx(roles: Role[]): AuthContext {
  const permissions = Array.from(new Set(roles.flatMap((r) => rolePermissions[r])));
  const bypass = roles.includes(Role.SUPER_ADMIN) || roles.includes(Role.ORGANIZATION_OWNER);
  return {
    userId: 'u1',
    tenantId: 'org1',
    roles,
    permissions,
    canBypassRbac: bypass,
    isPlatformAdmin: roles.includes(Role.SUPER_ADMIN),
    isSuperAdmin: bypass,
  };
}

const UNAFFECTED_SOURCES: DataSourceKey[] = [
  'vehicles',
  'trips',
  'maintenance',
  'drivers',
  'organizations',
  'alerts',
  'workorders',
];

beforeAll(() => bootstrapDataSources());

describe('assertDataSourceAccess', () => {
  it('allows a source with no requiredPermission regardless of the caller\'s permissions', () => {
    expect(() => assertDataSourceAccess('vehicles', ctx([Role.DRIVER]))).not.toThrow();
  });

  it('throws ForbiddenError for a caller lacking the source\'s requiredPermission', () => {
    expect(() => assertDataSourceAccess('allocations', ctx([Role.DRIVER]))).toThrow(ForbiddenError);
  });

  it('allows a caller holding the source\'s requiredPermission', () => {
    expect(() => assertDataSourceAccess('allocations', ctx([Role.ACCOUNTANT]))).not.toThrow();
  });

  it('allows an RBAC-bypass role (ORGANIZATION_OWNER) regardless of its listed permissions', () => {
    expect(() => assertDataSourceAccess('allocations', ctx([Role.ORGANIZATION_OWNER]))).not.toThrow();
  });

  it('does not throw for an unregistered data source key -- unknown-source validation is a different concern', () => {
    expect(() => assertDataSourceAccess('not-a-real-source' as DataSourceKey, ctx([Role.DRIVER]))).not.toThrow();
  });
});

describe('data-source permission wiring (the fix actually applied)', () => {
  it('expenses requires EXPENSE_VIEW (retroactive)', () => {
    expect(dataSourceRegistry.get('expenses')?.requiredPermission).toBe(Permission.EXPENSE_VIEW);
  });

  it('fuel requires FUEL_VIEW (retroactive)', () => {
    expect(dataSourceRegistry.get('fuel')?.requiredPermission).toBe(Permission.FUEL_VIEW);
  });

  it('allocations requires FINANCE_VIEW (ships gated from day one)', () => {
    expect(dataSourceRegistry.get('allocations')?.requiredPermission).toBe(Permission.FINANCE_VIEW);
  });

  it.each(UNAFFECTED_SOURCES)('%s is left with no requiredPermission -- unchanged pre-R.3.7 behaviour', (key) => {
    expect(dataSourceRegistry.get(key)?.requiredPermission).toBeUndefined();
  });
});

describe('the pre-existing gap, reproduced and then shown closed', () => {
  it.each([
    ['expenses', Permission.EXPENSE_VIEW],
    ['fuel', Permission.FUEL_VIEW],
    ['allocations', Permission.FINANCE_VIEW],
  ] as const)(
    'at least one real role holds REPORT_VIEW without the permission %s requires, and is denied by assertDataSourceAccess',
    (sourceKey, requiredPermission) => {
      const gapRoles = (Object.values(Role) as Role[]).filter((role) => {
        const perms = rolePermissions[role] ?? [];
        return perms.includes(Permission.REPORT_VIEW) && !perms.includes(requiredPermission);
      });

      // The gap must be real, not vacuously true.
      expect(gapRoles.length).toBeGreaterThan(0);

      for (const role of gapRoles) {
        const context = ctx([role]);
        // Confirms the role really can reach the Report Builder route
        // (REPORT_VIEW) -- the 403 must come from assertDataSourceAccess,
        // not from the route-level withAuth gate.
        expect(hasAnyPermission(context, [Permission.REPORT_VIEW])).toBe(true);
        expect(() => assertDataSourceAccess(sourceKey, context)).toThrow(ForbiddenError);
      }
    }
  );

  it('ACCOUNTANT and BRANCH_MANAGER (the roles that own finance data) are never in the allocations gap set', () => {
    const gapRoles = (Object.values(Role) as Role[]).filter((role) => {
      const perms = rolePermissions[role] ?? [];
      return perms.includes(Permission.REPORT_VIEW) && !perms.includes(Permission.FINANCE_VIEW);
    });
    expect(gapRoles).not.toContain(Role.ACCOUNTANT);
    expect(gapRoles).not.toContain(Role.BRANCH_MANAGER);
  });
});

function readSource(relativePath: string): string {
  return readFileSync(join(__dirname, '../..', relativePath), 'utf-8');
}

describe('source-conformance: every AuthContext-available checkpoint calls the assertion', () => {
  const definitionControllerSrc = readSource('modules/reporting/controllers/report-definition.controller.ts');
  const executionControllerSrc = readSource('modules/reporting/controllers/report-execution.controller.ts');
  const builderServiceSrc = readSource('modules/reporting/services/report-builder.service.ts');

  it('preview() passes the AuthContext (`context`) through to reportBuilderService.preview', () => {
    const fn = definitionControllerSrc.slice(
      definitionControllerSrc.indexOf('async preview('),
      definitionControllerSrc.indexOf('async previewPivot(')
    );
    expect(fn).toMatch(/reportBuilderService\.preview\(\s*id,\s*context\.tenantId,\s*undefined,\s*tenantContext,\s*context\s*\)/);
  });

  it('previewPivot() passes the AuthContext through to reportBuilderService.previewPivot', () => {
    const fn = definitionControllerSrc.slice(
      definitionControllerSrc.indexOf('async previewPivot('),
      definitionControllerSrc.indexOf('async drilldown(')
    );
    expect(fn).toMatch(/reportBuilderService\.previewPivot\(\s*id,\s*context\.tenantId,\s*tenantContext,\s*context\s*\)/);
  });

  it('report-builder.service.ts#preview asserts data-source access (when an AuthContext was supplied) before running the query', () => {
    const fn = builderServiceSrc.slice(
      builderServiceSrc.indexOf('async preview('),
      builderServiceSrc.indexOf('async previewPivot(')
    );
    const assertIdx = fn.indexOf('assertDataSourceAccess(');
    const runIdx = fn.indexOf('reportQueryEngine.run(');
    expect(assertIdx).toBeGreaterThan(-1);
    expect(runIdx).toBeGreaterThan(-1);
    expect(assertIdx).toBeLessThan(runIdx);
  });

  it('report-builder.service.ts#previewPivot asserts data-source access before running the query', () => {
    const fn = builderServiceSrc.slice(builderServiceSrc.indexOf('async previewPivot('));
    const assertIdx = fn.indexOf('assertDataSourceAccess(');
    const runFullIdx = fn.indexOf('reportQueryEngine.runFull(');
    expect(assertIdx).toBeGreaterThan(-1);
    expect(runFullIdx).toBeGreaterThan(-1);
    expect(assertIdx).toBeLessThan(runFullIdx);
  });

  it('drilldown() asserts data-source access, using the already-fetched definition, before calling drilldownService.drillInto', () => {
    const fn = definitionControllerSrc.slice(
      definitionControllerSrc.indexOf('async drilldown('),
      definitionControllerSrc.indexOf('async duplicate(')
    );
    const assertIdx = fn.indexOf('assertDataSourceAccess(definition.dataSource, context)');
    const drillIdx = fn.indexOf('drilldownService.drillInto(');
    expect(assertIdx).toBeGreaterThan(-1);
    expect(drillIdx).toBeGreaterThan(-1);
    expect(assertIdx).toBeLessThan(drillIdx);
  });

  it('create() asserts data-source access, gated on schedule.enabled, before syncSchedule -- an unscheduled save is never gated', () => {
    const fn = definitionControllerSrc.slice(
      definitionControllerSrc.indexOf('async create('),
      definitionControllerSrc.indexOf('async update(')
    );
    expect(fn).toMatch(/if \(created\.schedule\.enabled\) \{\s*assertDataSourceAccess\(created\.dataSource, context\);/);
    const assertIdx = fn.indexOf('assertDataSourceAccess(created.dataSource, context)');
    const syncIdx = fn.indexOf('reportSchedulerService.syncSchedule(');
    expect(assertIdx).toBeLessThan(syncIdx);
  });

  it('update() asserts data-source access, gated on schedule?.enabled, before syncSchedule', () => {
    const fn = definitionControllerSrc.slice(
      definitionControllerSrc.indexOf('async update('),
      definitionControllerSrc.indexOf('async delete(')
    );
    expect(fn).toMatch(/if \(updated\.schedule\?\.enabled\) \{\s*assertDataSourceAccess\(updated\.dataSource, context\);/);
    const assertIdx = fn.indexOf('assertDataSourceAccess(updated.dataSource, context)');
    const syncIdx = fn.indexOf('reportSchedulerService.syncSchedule(');
    expect(assertIdx).toBeLessThan(syncIdx);
  });

  it('report-execution.controller.ts#generate asserts data-source access for reportDefinitionId-sourced generation before calling the service', () => {
    const fn = executionControllerSrc.slice(
      executionControllerSrc.indexOf('async generate('),
      executionControllerSrc.indexOf('async download(')
    );
    expect(fn).toMatch(/if \(result\.data\.reportDefinitionId\)/);
    const assertIdx = fn.indexOf('assertDataSourceAccess(definition.dataSource, context)');
    // The doc comment above this method mentions
    // `reportExecutionService.generate()` in prose (explaining why the
    // permission check re-fetches the definition), so the search must
    // anchor on the real invocation (`await ...generate(`) rather than
    // the bare method name, or it would match the comment instead.
    const generateIdx = fn.indexOf('await reportExecutionService.generate(');
    expect(assertIdx).toBeGreaterThan(-1);
    expect(generateIdx).toBeGreaterThan(-1);
    expect(assertIdx).toBeLessThan(generateIdx);
  });

  it('dashboardId-sourced generation is documented as a known, deliberate gap (not silently ungated)', () => {
    const fn = executionControllerSrc.slice(
      executionControllerSrc.indexOf('async generate('),
      executionControllerSrc.indexOf('async download(')
    );
    expect(fn).toMatch(/dashboard-sourced generation.*NOT.*covered/is);
  });
});
