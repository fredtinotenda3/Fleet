// tests/security/write-scope-conformance.spec.ts
//
// The WRITE-side counterpart to module-scope-conformance.spec.ts.
//
// WHY THIS EXISTS
// ---------------
// The existing conformance suite checks that an 'org-unit' module has
// its tenancy addendum and that its repository applies
// tenantScopeService.buildFilter. Every one of those checks passed while
// FIVE modules -- drivers, dispatch, bookings, inventory, workshop --
// shipped a create path that never wrote `orgUnitId` at all.
//
// That combination is worse than an unscoped read, and it is invisible
// to every existing test:
//
//   - the READ filters on `{ orgUnitId: { $in: accessible } }`
//   - the WRITE never sets the field
//   - therefore the record matches nothing, forever
//
// The user sees `201 Created` followed by an empty list. It reads as
// data loss, and it is reported as "the save button doesn't work". An
// org-wide admin (accessibleOrgUnitIds === null, no filter applied) sees
// every record, which is why it survives demos and reaches customers.
//
// A read-side-only conformance suite cannot catch this, because nothing
// about the read is wrong. So this file asserts the other half of the
// invariant: if a module's rows are FILTERED by orgUnitId, some write
// path in that module must be capable of SETTING orgUnitId.
//
// Structural (filesystem) rather than behavioural, for the same reason
// module-scope-conformance.spec.ts is: importing these services pulls in
// the whole Mongo/Next dependency graph, and the property is a property
// of the source.
//
// WHAT THIS SUITE DOES NOT CATCH -- READ THIS BEFORE TRUSTING IT
// --------------------------------------------------------------
// Run against the tree as it stood before these fixes, this suite goes
// red for bookings, dispatch, inventory, workshop, digital-twin and
// scheduling. It stays GREEN for the two that were also broken:
//
//   - drivers, because DriverController DID mention `orgUnitId` -- it
//     computed one and spread it into the request body, where zod then
//     stripped it. The mention was real; the write was not.
//   - fuel-cards, because its service mentioned `orgUnitId` in
//     getByIdInScope, which is a READ check in a write-layer file.
//
// Both are the same failure mode: a file can name the field without any
// value reaching Mongo. No filesystem check can see that difference,
// and pretending otherwise would be worse than the gap. The behavioural
// round-trip tests in tests/security/org-unit-write-roundtrip.spec.ts
// are what cover it -- they assert the field is present in the document
// actually handed to the repository. This suite is the cheap net that
// catches a whole module with no write at all; that one is the fine
// net. Neither replaces the other.

import * as fs from 'fs';
import * as path from 'path';
import { MODULE_SCOPE_REGISTRY } from '../../server/tenancy/module-scope.registry';

const ROOT = path.resolve(__dirname, '../..');

function filesUnder(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const isTestFile = (f: string) => f.includes('__tests__') || f.includes('.spec.') || f.includes('.test.');

/**
 * The layers where a create payload is normally assembled.
 *
 * Types and addenda are excluded deliberately: DECLARING `orgUnitId` is
 * precisely the step that gives false comfort -- all six modules this
 * suite was written for had the declaration and not the write.
 */
const WRITE_LAYER = /\/(services|commands|handlers|controllers)\//;

/**
 * Repositories are excluded from WRITE_LAYER because a repository
 * mentioning `orgUnitId` is usually the READ filter -- which passes
 * happily while the write is missing, and is exactly the false positive
 * this suite exists to avoid.
 *
 * But one module legitimately writes there: `digital-twin` is a
 * projection with no service-level create at all, so its only write is
 * the `findOneAndUpdate` upsert in its repository. Rather than grant it
 * a named exception (which would stop checking it), a repository counts
 * as a writer only when `orgUnitId` appears in an actual WRITE
 * position -- inside a `$set` / `$setOnInsert` / `insertOne` /
 * `.create(` payload -- within a few lines. A read filter never matches
 * that.
 */
const WRITE_POSITION = /(\$set|\$setOnInsert|insertOne|\.create\()[\s\S]{0,400}?orgUnitId/;

function writesOrgUnitId(rel: string): boolean {
  const src = read(rel);
  if (!/orgUnitId/.test(src)) return false;
  const normalized = '/' + rel.replace(/\\/g, '/');
  if (WRITE_LAYER.test(normalized)) return true;
  if (/\/repositories\//.test(normalized)) return WRITE_POSITION.test(src);
  return false;
}

/** Modules that own at least one real collection and are org-unit scoped. */
const scopedModules = MODULE_SCOPE_REGISTRY.filter(
  (e) => e.level === 'org-unit' && e.collections.length > 0
);

describe('write-scope conformance: every org-unit module can set orgUnitId on create', () => {
  it('has org-unit modules to check (guards against the filter silently matching nothing)', () => {
    expect(scopedModules.length).toBeGreaterThan(10);
  });

  it.each(scopedModules.map((e) => [e.module, e] as const))(
    '%s assembles orgUnitId somewhere in its write layer',
    (_name, entry) => {
      const writers = filesUnder(path.join('modules', entry.module))
        .filter((f) => !isTestFile(f))
        .filter(writesOrgUnitId);

      // Asserted as an object rather than a bare length so the failure
      // output names the module and where its orgUnitId is supposed to
      // come from -- that is what the next engineer needs in order to
      // fix it, and a bare `expect(0).toBeGreaterThan(0)` gives neither.
      expect({
        module: entry.module,
        orgUnitSource: entry.orgUnitSource,
        canSetOrgUnitIdOnWrite: writers.length > 0,
      }).toEqual({
        module: entry.module,
        orgUnitSource: entry.orgUnitSource,
        canSetOrgUnitIdOnWrite: true,
      });
    }
  );

  it('every org-unit module declares where its orgUnitId comes from', () => {
    const missing = scopedModules.filter((e) => !e.orgUnitSource);
    expect(missing.map((e) => e.module)).toEqual([]);
  });
});

describe('write-scope conformance: no write path resolves a vehicle by plate unscoped', () => {
  /**
   * Ten handlers used to run
   *
   *   db.collection('tblvehicles').findOne({ license_plate: ... })
   *
   * with no tenantId filter, and then copied the resolved vehicle's
   * orgUnitId onto the record being written -- so a plate collision
   * across tenants filed a cost under a foreign org unit, and a branch
   * manager could file against another branch's truck. They are all
   * routed through vehicleWriteResolver now.
   *
   * This pins that. Re-introducing the raw query is the single easiest
   * way to undo the fix, because it looks entirely ordinary in review.
   */
  const RAW_VEHICLE_LOOKUP = /collection\(\s*['"]tblvehicles['"]\s*\)\s*\.\s*findOne/;

  const sourceFiles = [
    ...filesUnder('modules'),
    ...filesUnder('app'),
    ...filesUnder('server'),
    ...filesUnder('workers'),
  ].filter((f) => !isTestFile(f));

  /**
   * The resolver's own file names the pattern in its explanatory
   * comment, and the meter-log route is a permitted exception (it is
   * tenant-filtered inline and asserted separately below).
   */
  const ALLOWED = [
    // Names the pattern in its own explanatory comment.
    'modules/vehicles/services/vehicle-write-resolver.service.ts',
    'server/tenancy/write-scope.ts',
    // Tenant-filtered inline; asserted separately below.
    'app/api/meterlogs/route.ts',
  ];

  it('lists no unexpected raw tblvehicles.findOne call sites', () => {
    const offenders = sourceFiles
      .filter((f) => !ALLOWED.includes(f.replace(/\\/g, '/')))
      .filter((f) => RAW_VEHICLE_LOOKUP.test(read(f)));

    expect(offenders).toEqual([]);
  });

  it('the permitted meter-log exception still filters by tenantId', () => {
    const src = read('app/api/meterlogs/route.ts');
    const lookups = src.split(/collection\(\s*['"]tblvehicles['"]\s*\)\s*\.\s*findOne\(/).slice(1);
    expect(lookups.length).toBeGreaterThan(0);
    for (const after of lookups) {
      // The filter object is everything up to the closing of the call.
      const filterBlock = after.slice(0, after.indexOf('})'));
      expect(filterBlock).toMatch(/tenantId/);
    }
  });
});

describe('write-scope conformance: WriteScope cannot be bypassed', () => {
  const src = read('server/tenancy/write-scope.ts');

  it('offers no unscoped variant', () => {
    // A third union member that skips the tenant filter would silently
    // restore the original defect at every call site at once.
    expect(src).not.toMatch(/kind:\s*'unscoped'/);
    expect(src).not.toMatch(/kind:\s*'none'/);
  });

  it('requires a reason for a system write', () => {
    expect(src).toMatch(/systemWriteScope requires a non-empty reason/);
  });

  it('resolveForWrite reports out-of-scope identically to not-found', () => {
    const resolver = read('modules/vehicles/services/vehicle-write-resolver.service.ts');
    // One throw site covering both conditions is the property: two
    // separate throws would drift into distinguishable messages, which
    // is an enumeration oracle for a scope-narrowed caller.
    expect(resolver).toMatch(
      /if \(result\.status === 'not_found' \|\| !isWritable\(result\.vehicle, scope\)\) \{[\s\S]{0,160}VEHICLE_NOT_FOUND/
    );
  });

  it('never resolves an ambiguous plate to an arbitrary match', () => {
    const resolver = read('modules/vehicles/services/vehicle-write-resolver.service.ts');
    expect(resolver).toMatch(/VEHICLE_PLATE_AMBIGUOUS/);
    // resolveByPlate (not findOne) is what makes ambiguity detectable at
    // all -- findOne returns the first match and cannot count.
    expect(resolver).toMatch(/resolveByPlate\(/);
    expect(resolver).not.toMatch(/matches\[0\]/);
  });
});
