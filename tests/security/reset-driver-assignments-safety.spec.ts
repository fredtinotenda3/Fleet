// tests/security/reset-driver-assignments-safety.spec.ts
//
// PART 3 ("create a safe, explicit reset script that clears current
// vehicle-driver assignments... must affect ONLY the driver assignment
// relationship; must NOT delete vehicles/drivers/fuel records/expenses/
// trips/master data; must NOT affect users/authentication/permissions/
// tenancy; dry-run by default; explicit confirmation before applying;
// reversible; never runs automatically").
//
// Mirrors tests/security/reset-business-data-classification.spec.ts's
// "assert the source, not just review it" approach for the same class of
// script: this reset touches exactly one field on one collection, so the
// properties worth guarding are narrower than reset-business-data.ts's
// classification tables, but just as important to keep true across
// future edits.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(ROOT, 'scripts/reset-driver-assignments.ts'), 'utf8');

describe('reset-driver-assignments: safety properties', () => {
  it('is dry-run by default, --confirm required to apply', () => {
    expect(src).toMatch(/hasFlag\('confirm'\)/);
    expect(src).toMatch(/MODE: DRY RUN/);
    expect(src).toMatch(/if \(!confirm\)/);
  });

  it('requires --tenant explicitly -- never infers or defaults it', () => {
    expect(src).toMatch(/--tenant <slug> is required\. Tenant is never inferred or defaulted/);
  });

  it('resolves the tenant via the shared safe resolver, not a naive string match', () => {
    // scripts/lib/tenant-identity.ts exists specifically because naive
    // String(org._id)-style resolution corrupted data in a prior script
    // (backfill-user-tenants.ts, now disabled). This script must not
    // repeat that mistake.
    expect(src).toMatch(/buildTenantIdentityIndex/);
    expect(src).toMatch(/resolveCanonical/);
  });

  it('only ever writes tblvehicles.currentDriverId -- no other field', () => {
    const setCalls = [...src.matchAll(/\$set:\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(setCalls.length).toBeGreaterThan(0);
    for (const fields of setCalls) {
      // Only currentDriverId and the standard updatedAt bookkeeping
      // timestamp may appear in any $set this script issues.
      const fieldNames = [...fields.matchAll(/(\w+):/g)].map((m) => m[1]);
      for (const name of fieldNames) {
        expect(['currentDriverId', 'updatedAt']).toContain(name);
      }
    }
  });

  it('never deletes or drops anything', () => {
    expect(src).not.toMatch(/deleteMany/);
    expect(src).not.toMatch(/deleteOne/);
    expect(src).not.toMatch(/\.drop\(\)/);
    expect(src).not.toMatch(/dropCollection/);
  });

  it('never writes to tbldrivers, tblfuellogs, or any collection other than tblvehicles and the audit trail', () => {
    // Only assert against actual db.collection(...) call sites, not the
    // header comment's prose explaining what is deliberately out of
    // scope (which necessarily names these collections in order to
    // disclaim them).
    const collectionCalls = [...src.matchAll(/\.collection<?[^(]*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(collectionCalls).toEqual(
      expect.arrayContaining(['tblvehicles', 'tbldrivers', 'tbltenant_repair_audit'])
    );
    for (const name of collectionCalls) {
      expect(['tblvehicles', 'tbldrivers', 'tbltenant_repair_audit']).toContain(name);
    }
    // tbldrivers is read from (to resolve names for the manifest) but
    // must never be written to.
    expect(src).not.toMatch(/tbldrivers['"]\)\s*\.\s*(updateOne|updateMany|deleteOne|deleteMany|insertOne)/);
  });

  it('writes a full before/after audit record before reporting success', () => {
    expect(src).toMatch(/tbltenant_repair_audit/);
    expect(src).toMatch(/DRIVER_ASSIGNMENT_RESET/);
    expect(src).toMatch(/previousDriverId/);
  });

  it('is not wired into build, deploy, postinstall or start scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    for (const lifecycle of ['build', 'start', 'postinstall', 'preinstall', 'dev']) {
      const command = pkg.scripts?.[lifecycle];
      if (command) {
        expect(command).not.toMatch(/reset-driver-assignments/);
      }
    }
    // It must be reachable manually, though.
    expect(pkg.scripts['db:reset-driver-assignments']).toMatch(/reset-driver-assignments\.ts/);
  });

  it('documents that fuel-log driver attribution is unaffected', () => {
    // The single most important thing an operator running this script
    // must understand: it does not touch, and cannot fix, "Fuel cost by
    // driver" or any other fuel analytic. See PART 4 investigation.
    expect(src).toMatch(/does not touch.*fuel|WHY THIS DOES NOT TOUCH FUEL ANALYTICS/is);
  });
});
