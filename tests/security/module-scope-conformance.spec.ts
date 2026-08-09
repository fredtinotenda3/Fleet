// tests/security/module-scope-conformance.spec.ts
//
// Turns the tenancy decisions in server/tenancy/module-scope.registry.ts
// from documentation into an enforced invariant.
//
// WHY THIS EXISTS
// ---------------
// The recurring failure in this codebase has not been "someone wrote a
// bad filter". It has been "someone added a read path and did not think
// about scoping at all" -- the list endpoint gets a filter, the stats
// endpoint does not, and nothing fails. Forgetting is invisible, which
// makes it the default outcome under deadline.
//
// These tests read the registry and check the source tree against it. A
// module declared 'org-unit' that lacks its addendum or its repository
// wiring fails here, at PR time, instead of leaking in production.
//
// Deliberately filesystem-based rather than importing the repositories:
// importing them pulls in the whole Mongo/Next dependency graph, and the
// property being asserted is a structural one about the source.

import * as fs from 'fs';
import * as path from 'path';
import {
  MODULE_SCOPE_REGISTRY,
  orgUnitScopedModules,
  unconfirmedDecisions,
} from '../../server/tenancy/module-scope.registry';

const ROOT = path.resolve(__dirname, '../..');

function readIfExists(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

/** Every .ts file under a module directory, recursively. */
function filesUnder(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      out.push(...filesUnder(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('module scope registry integrity', () => {
  it('declares a unique entry per module', () => {
    const names = MODULE_SCOPE_REGISTRY.map((e) => e.module);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every org-unit module a declared orgUnitSource', () => {
    // Without a source, the backfill migration has nothing to join to
    // and would have to guess which unit owns a row. Guessing an owner
    // is how data ends up in the wrong tenant.
    for (const entry of orgUnitScopedModules()) {
      expect(entry.orgUnitSource).toBeDefined();
    }
  });

  it('gives every entry a non-trivial rationale', () => {
    for (const entry of MODULE_SCOPE_REGISTRY) {
      expect(entry.rationale.length).toBeGreaterThan(40);
    }
  });

  it('declares at least one collection per module', () => {
    for (const entry of MODULE_SCOPE_REGISTRY) {
      expect(entry.collections.length).toBeGreaterThan(0);
    }
  });

  it('never assigns the same collection to two modules', () => {
    const seen = new Map<string, string>();
    for (const entry of MODULE_SCOPE_REGISTRY) {
      for (const collection of entry.collections) {
        const owner = seen.get(collection);
        expect(owner === undefined || owner === entry.module).toBe(true);
        seen.set(collection, entry.module);
      }
    }
  });
});

describe('org-unit-scoped modules are actually wired', () => {
  // The whole point of the suite. Each assertion below corresponds to
  // one thing a developer must not forget when scoping a module.

  const scoped = orgUnitScopedModules();

  it.each(scoped.map((e) => [e.module] as const))(
    '%s declares an orgUnitId field on its entity type',
    (moduleName) => {
      // Two legal shapes, both in use:
      //   (a) inline on the base type -- how the five original modules
      //       (vehicles/fuel/expenses/trips/maintenance) did it;
      //   (b) a *.tenancy-addendum.ts module augmentation -- the
      //       established pattern for everything added since, because it
      //       is purely additive and cannot regress existing importers.
      // The invariant is that the field EXISTS, not which shape declares
      // it. Requiring (b) universally would fail the modules that have
      // been correctly scoped and running in production since Phase B.
      const candidates = [
        ...filesUnder(`modules/${moduleName}/types`),
        ...filesUnder('shared/types'),
      ];

      const declaresOrgUnitId = candidates.some((file) => {
        const src = readIfExists(file) ?? '';
        return src.includes('orgUnitId?: string');
      });

      expect(declaresOrgUnitId).toBe(true);
    }
  );

  it.each(scoped.map((e) => [e.module] as const))(
    '%s has a repository that applies org-unit scoping',
    (moduleName) => {
      const repoFiles = filesUnder(`modules/${moduleName}/repositories`);
      expect(repoFiles.length).toBeGreaterThan(0);

      // Wiring is either extending TenantScopedRepository (which supplies
      // findManyInScope / findWithPaginationInScope) or calling
      // tenantScopeService.buildFilter directly for bespoke queries.
      const wired = repoFiles.some((file) => {
        const src = readIfExists(file) ?? '';
        return (
          src.includes('TenantScopedRepository') ||
          src.includes('tenantScopeService')
        );
      });

      expect(wired).toBe(true);
    }
  );

  it.each(scoped.map((e) => [e.module] as const))(
    '%s imports its addendum at the query site, when it uses one',
    (moduleName) => {
      // A module-augmentation addendum only takes effect in files that
      // import it. An addendum no repository imports is dead weight:
      // TypeScript rejects `orgUnitId` in the filter, the developer
      // reaches for `as any`, and the scoping bug gets typed away rather
      // than caught.
      //
      // Conditional on the module actually using an addendum -- modules
      // that declare the field inline have nothing to import.
      const addendaForModule = [
        ...filesUnder(`modules/${moduleName}/types`),
      ].filter((f) => f.includes('tenancy-addendum'));

      if (addendaForModule.length === 0) {
        // Inline declaration; nothing to assert. Verified by the
        // preceding test instead.
        return;
      }

      const repoFiles = filesUnder(`modules/${moduleName}/repositories`);
      const imported = repoFiles.some((file) => {
        const src = readIfExists(file) ?? '';
        return src.includes('tenancy-addendum');
      });
      expect(imported).toBe(true);
    }
  );
});

describe('modules deliberately left organization-wide', () => {
  it('are recorded with a rationale rather than merely omitted', () => {
    // "We looked at this and decided shared" and "nobody has looked at
    // this yet" must not be indistinguishable. Every module directory on
    // disk should appear in the registry.
    const moduleDirs = fs
      .readdirSync(path.join(ROOT, 'modules'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      // Cross-cutting modules that own no collections of their own.
      .filter((name) => !['tenancy', 'ai', 'analytics', 'esg'].includes(name));

    const declared = new Set(MODULE_SCOPE_REGISTRY.map((e) => e.module));
    const undeclared = moduleDirs.filter((m) => !declared.has(m));

    expect(undeclared).toEqual([]);
  });
});

describe('open decisions stay visible', () => {
  it('reports which scope decisions still need product sign-off', () => {
    const open = unconfirmedDecisions();
    // Not an assertion that the list is empty -- it is a deliberate
    // surface so the count cannot quietly drift upward unnoticed. If you
    // are confirming a decision, flip `confirmed` and update this number.
    expect(open.map((e) => e.module).sort()).toEqual([
      'attention',
      'compliance',
      // finance: allocation postings/depreciation profiles inherit vehicle
      // scope (settled), but whether GL submissions are per-branch or one
      // consolidated organization figure is an open product question --
      // see the module's rationale in the registry.
      'finance',
      'fuel-cards',
      'fuel-stations',
      'intelligence',
      'procurement',
      'reporting',
      'sla',
      'vendors',
    ]);
  });
});
