// tests/security/export-scope-conformance.spec.ts
//
// Locks in the export audit.
//
// Exports are the highest-consequence read path in the product: the
// output leaves the application and is kept. The audit found all five
// paths (expenses, fuel, maintenance, trips, vehicles) correctly scoped
// — every one resolves a TenantContext in its controller and applies the
// org-unit predicate in its repository.
//
// That is a snapshot, and a snapshot decays. A sixth export added next
// month, or a `tenantId`-only variant slipped alongside an existing one,
// would reintroduce the leak silently — there is no test that fails when
// an export forgets to scope. This is that test.
//
// Structural (reads the source) rather than behavioural, because the
// property being asserted is "this code path threads scope", which is
// visible in the source and would otherwise need a live Mongo to prove.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Every export endpoint in the product, and the repository it reads through. */
const EXPORTS = [
  {
    module: 'expenses',
    controller: 'modules/expenses/controllers/expense.controller.ts',
    repository: 'modules/expenses/repositories/expense.repository.ts',
    method: 'getFilteredExpensesForExport',
  },
  {
    module: 'fuel',
    controller: 'modules/fuel/controllers/fuel.controller.ts',
    repository: 'modules/fuel/repositories/fuel.repository.ts',
    method: 'getFilteredLogsForExport',
  },
  {
    module: 'maintenance',
    controller: 'modules/maintenance/controllers/maintenance.controller.ts',
    repository: 'modules/maintenance/repositories/maintenance.repository.ts',
    method: 'getFilteredRemindersForExport',
  },
  {
    module: 'trips',
    controller: 'modules/trips/controllers/trip.controller.ts',
    repository: 'modules/trips/repositories/trip.repository.ts',
    method: 'getFilteredTripsForExport',
  },
  {
    module: 'vehicles',
    controller: 'modules/vehicles/controllers/vehicle.controller.ts',
    repository: 'modules/vehicles/repositories/vehicle.repository.ts',
    method: 'getFilteredVehiclesForExport',
  },
];

describe('every export repository method takes a TenantContext', () => {
  it.each(EXPORTS.map((e) => [e.module, e.repository, e.method] as const))(
    '%s',
    (_module, repository, method) => {
      const src = read(repository);
      const at = src.indexOf(`async ${method}(`);
      expect(at).toBeGreaterThan(-1);

      // Parameter list: from the opening paren to its matching close.
      const open = src.indexOf('(', at);
      const close = src.indexOf(')', open);
      const params = src.slice(open + 1, close);

      // A `tenantId: string`-only export signature is the leak shape: it
      // cannot express org-unit scope at all.
      expect(params).toContain('TenantContext');
    }
  );
});

describe('every export controller resolves a TenantContext', () => {
  it.each(EXPORTS.map((e) => [e.module, e.controller] as const))(
    '%s',
    (_module, controller) => {
      const src = read(controller);
      // Either the shared helper or an inline resolveContext call — both
      // produce a real context. What must NOT happen is an export
      // reading only getTenantFromRequest.
      const resolves =
        src.includes('resolveTenantContext') ||
        src.includes('tenantContextService.resolveContext');
      expect(resolves).toBe(true);
    }
  );
});

describe('export row caps exist', () => {
  it.each(EXPORTS.map((e) => [e.module, e.repository] as const))(
    '%s applies a row cap',
    (_module, repository) => {
      // An uncapped export is a denial-of-service and a memory risk on a
      // serverless function, independent of tenancy.
      const src = read(repository);
      expect(src).toMatch(/EXPORT_ROW_CAP|cap: number/);
    }
  );
});
