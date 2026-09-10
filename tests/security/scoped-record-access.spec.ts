// tests/security/scoped-record-access.spec.ts
//
// "What a caller can reach by id must equal what they can reach by
// listing."
//
// ---------------------------------------------------------------------
// THE FAIL-OPEN
// ---------------------------------------------------------------------
// Five by-id controller helpers -- fuel, expenses, trips, maintenance,
// vehicles, plus the driver check inside vehicle assignment -- each
// wrote the org-unit test inline as:
//
//     if (row.orgUnitId && !canAccessOrgUnit(ctx, row.orgUnitId)) 404
//
// The leading truthiness test is the hole. A record carrying NO
// orgUnitId skipped the check entirely and was readable, updatable and
// DELETABLE by any authenticated user holding the permission -- while
// `buildFilter` (`{orgUnitId: {$in: [...]}}`, which never matches a
// missing field) hid that same record from every list.
//
// So the two halves of the scoping model disagreed, and the permissive
// half was the one reachable by walking ids. The records most likely to
// lack an org unit are the oldest -- written before scoping existed, and
// least likely to belong to the caller's branch.
//
// It was deferred one round deliberately: on a database that predates
// org-unit scoping, closing this hides legacy rows from narrowed users
// until `npm run tenancy:backfill` has run, and shipping that as a
// surprise would have been an outage. The database has since been reset,
// so there is nothing left to lock anyone out of.
//
// ---------------------------------------------------------------------
// WHY BOTH HALVES OF THIS FILE EXIST
// ---------------------------------------------------------------------
// The truth table pins the predicate. The source scan pins the ABSENCE
// of the idiom, because the predicate being correct does not stop the
// seventh call site from being written the old way -- which is exactly
// how six copies of it came to exist.

import fs from 'fs';
import path from 'path';
import { tenantScopeService } from '../../modules/tenancy/services/tenant-scope.service';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

const ROOT = path.resolve(__dirname, '../..');

const context = (accessibleOrgUnitIds: string[] | null): TenantContext =>
  ({
    organizationId: 'willsgrove-farm-enterprises-9e80ed',
    organizationName: 'Willsgrove',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  }) as TenantContext;

describe('tenantScopeService.canAccessRecord', () => {
  const HARARE = 'branch-harare';
  const BULAWAYO = 'branch-bulawayo';

  it('an org-wide caller reaches everything, including unassigned rows', () => {
    expect(tenantScopeService.canAccessRecord(context(null), HARARE)).toBe(true);
    expect(tenantScopeService.canAccessRecord(context(null), undefined)).toBe(true);
    expect(tenantScopeService.canAccessRecord(context(null), null)).toBe(true);
  });

  it('a narrowed caller reaches their own units', () => {
    expect(tenantScopeService.canAccessRecord(context([HARARE]), HARARE)).toBe(true);
  });

  it('a narrowed caller cannot reach another branch', () => {
    expect(tenantScopeService.canAccessRecord(context([HARARE]), BULAWAYO)).toBe(false);
  });

  it('THE FIX: a narrowed caller cannot reach a record with no org unit', () => {
    // This returned "accessible" before, because the check was skipped
    // entirely for such rows.
    expect(tenantScopeService.canAccessRecord(context([HARARE]), undefined)).toBe(false);
    expect(tenantScopeService.canAccessRecord(context([HARARE]), null)).toBe(false);
    expect(tenantScopeService.canAccessRecord(context([HARARE]), '')).toBe(false);
  });

  it('a caller whose assignments resolved to nothing reaches nothing', () => {
    // Matches buildFilter's `{$in: []}` branch: assignments that
    // resolved to an empty set fail closed rather than widening.
    expect(tenantScopeService.canAccessRecord(context([]), HARARE)).toBe(false);
    expect(tenantScopeService.canAccessRecord(context([]), undefined)).toBe(false);
  });

  it('agrees with buildFilter on every case', () => {
    // The property that matters is not either rule in isolation, it is
    // that they MATCH. Six copies of an inline check drifted from the
    // filter; a shared predicate cannot.
    const rows: Array<{ orgUnitId?: string }> = [
      { orgUnitId: HARARE },
      { orgUnitId: BULAWAYO },
      {},
    ];

    for (const accessible of [null, [HARARE], [HARARE, BULAWAYO], []] as const) {
      const ctx = context(accessible === null ? null : [...accessible]);
      const filter = tenantScopeService.buildFilter<{ orgUnitId?: string }>(ctx, 'orgUnitId');
      const inList = rows.filter((row) => {
        const clause = (filter as Record<string, { $in?: string[] }>).orgUnitId;
        if (!clause) return true; // no filter applied at all
        return row.orgUnitId !== undefined && clause.$in!.includes(row.orgUnitId);
      });
      const byId = rows.filter((row) => tenantScopeService.canAccessRecord(ctx, row.orgUnitId));
      expect(byId).toEqual(inList);
    }
  });
});

describe('no by-id check reintroduces the fail-open idiom', () => {
  /** Comments quote the old code; a code check must not read prose. */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  const sources = [...walk(path.join(ROOT, 'modules')), ...walk(path.join(ROOT, 'server'))];

  it('scanned a meaningful number of files', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('nothing guards canAccessOrgUnit behind a truthiness test on the same value', () => {
    // `foo && !canAccessOrgUnit(ctx, foo)` -- the exact shape that
    // silently permitted every unassigned record.
    const pattern = /([A-Za-z_$][\w$]*)\s*&&\s*\n?\s*!\s*tenantScopeService\.canAccessOrgUnit\(\s*\w+\s*,\s*\1\s*\)/;
    const offenders = sources.filter((file) => pattern.test(stripComments(fs.readFileSync(file, 'utf8'))));

    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("nothing passes `?? ''` into canAccessOrgUnit", () => {
    // That idiom fails closed only by accident -- an empty string
    // happens not to be in any accessible list. It reads like a
    // null-safety default, so the next person to tidy it opens the hole.
    const offenders = sources.filter((file) =>
      /canAccessOrgUnit\([^)]*\?\?\s*''/.test(stripComments(fs.readFileSync(file, 'utf8')))
    );
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('every by-id loader uses the shared predicate', () => {
    const loaders = [
      'modules/fuel/controllers/fuel.controller.ts',
      'modules/expenses/controllers/expense.controller.ts',
      'modules/trips/controllers/trip.controller.ts',
      'modules/maintenance/controllers/maintenance.controller.ts',
      'modules/vehicles/controllers/vehicle.controller.ts',
    ];
    for (const rel of loaders) {
      const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      expect({ file: rel, usesSharedPredicate: src.includes('canAccessRecord(') }).toEqual({
        file: rel,
        usesSharedPredicate: true,
      });
    }
  });
});
