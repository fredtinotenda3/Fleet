// tests/security/reset-business-data-classification.spec.ts
//
// The reset script's deletion mechanics are ten lines of `deleteMany`.
// ALL of its risk is in the classification: which collections are
// operational data a customer regenerates by working, and which are
// configuration they would have to rebuild by hand.
//
// Get that wrong in one direction and "reset my data" deletes a
// customer's roles, workflows and login credentials. Get it wrong in the
// other and the reset silently leaves half the fleet behind, so the
// customer starts again on top of stale records.
//
// So the classification is asserted, not reviewed.

import {
  CLEAR,
  PRESERVE,
  IGNORE,
} from '../../scripts/reset-business-data';
import { MODULE_SCOPE_REGISTRY } from '../../server/tenancy/module-scope.registry';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const names = (list: Array<{ collection: string }>) => list.map((e) => e.collection);

describe('reset classification: structure', () => {
  it('every entry carries a reason', () => {
    // A classification without a reason is an assertion nobody can
    // review. The reason is the artefact; the list is the index.
    for (const entry of [...CLEAR, ...PRESERVE, ...IGNORE]) {
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });

  it('no collection is classified twice', () => {
    const all = [...names(CLEAR), ...names(PRESERVE), ...names(IGNORE)];
    const duplicates = all.filter((c, i) => all.indexOf(c) !== i);
    expect(duplicates).toEqual([]);
  });

  it('clears a substantial set and preserves a substantial set', () => {
    // A guard against a refactor that empties one list: an empty CLEAR
    // makes the script a no-op that reports success, and an empty
    // PRESERVE makes it a database wipe.
    expect(CLEAR.length).toBeGreaterThan(30);
    expect(PRESERVE.length).toBeGreaterThan(25);
  });
});

describe('reset classification: things that must NEVER be cleared', () => {
  const cleared = new Set(names(CLEAR));

  it.each([
    ['tbladmin', 'login credentials — clearing locks everyone out'],
    ['tblorganizations', 'the organization itself'],
    ['tblorgunits', 'the branch tree every record inherits scope from'],
    ['tbluser_scope_assignments', 'which user belongs to which branch'],
    ['tblcustomroles', 'customer-defined roles'],
    ['tblresourcepermissions', 'per-resource grants'],
    ['tblapikeys', 'integration credentials in active use'],
    ['tblworkflows', 'workflow DEFINITIONS'],
    ['tblrules', 'automation rule definitions'],
    ['tblreporttemplates', 'report templates'],
    ['tblreportdefinitions', 'customer-authored reports'],
    ['tblauditlog', 'the record of who did what, including this reset'],
    ['tblunits', 'the global km/litre catalogue'],
    ['tblexpense_types', 'expense categories — re-seeding changes every id'],
  ])('%s is preserved (%s)', (collection) => {
    expect(cleared.has(collection)).toBe(false);
    expect(names(PRESERVE)).toContain(collection);
  });
});

describe('reset classification: things that MUST be cleared', () => {
  const cleared = new Set(names(CLEAR));

  it.each([
    'tblvehicles',
    'tbldrivers',
    'tbltrips',
    'tblfuellogs',
    'tblexpenses',
    'tblreminders',
    'tblworkorders',
    'tblspareparts',
    'tblstockmovements',
    'tbldispatchjobs',
    'tblworkshopbays',
    'tbltelematics',
    'tbltelematics_alerts',
    'tblvehicledigitaltwins',
    'tblattentionitems',
    'tblanomalies',
    'tblallocationledger',
    'tblvalueledger',
    'tblnotifications',
    'tbldvirinspections',
    'tblcompliancerecords',
  ])('%s is cleared', (collection) => {
    expect(cleared.has(collection)).toBe(true);
  });
});

describe('reset classification: definitions survive, instances do not', () => {
  // The distinction a customer cares about most. Losing a workflow
  // DEFINITION means re-authoring it; losing its instances means losing
  // history of cleared records, which is the point of the reset.
  it.each([
    ['tblworkflows', 'tblworkflow_instances'],
    ['tblcompliancerules', 'tblcompliancerecords'],
    ['tblslapolicies', 'tblslatrackings'],
    ['tblreportdefinitions', 'tblreportexecutions'],
    ['tblwebhooksubscriptions', 'tblwebhookdeliveries'],
  ])('%s is preserved while %s is cleared', (definition, instance) => {
    expect(names(PRESERVE)).toContain(definition);
    expect(names(CLEAR)).toContain(instance);
  });
});

describe('reset classification: derived state is cleared with its source', () => {
  it('trip-detection watermarks are cleared alongside trips', () => {
    // THE ONE THAT BITES. Clearing tbltrips but keeping
    // tbltrip_detection_state leaves every vehicle's watermark in the
    // future, so the sweep skips all existing telemetry and NO trips are
    // ever regenerated. The fleet looks permanently idle and nothing
    // errors.
    expect(names(CLEAR)).toContain('tbltrips');
    expect(names(CLEAR)).toContain('tbltrip_detection_state');
  });

  it('digital twins are cleared alongside vehicles', () => {
    // A twin is a projection of a vehicle. Keeping twins for deleted
    // vehicles leaves the live map showing a fleet that does not exist.
    expect(names(CLEAR)).toContain('tblvehicles');
    expect(names(CLEAR)).toContain('tblvehicledigitaltwins');
  });

  it('telemetry rollups are cleared alongside raw telemetry', () => {
    expect(names(CLEAR)).toContain('tbltelematics');
    expect(names(CLEAR)).toContain('tbltelematics_daily_rollup');
  });

  it('undelivered events about cleared records are cleared', () => {
    // An outbox full of ExpenseCreated events for expenses that no
    // longer exist would replay into the allocation ledger after the
    // reset and post costs for deleted records.
    expect(names(CLEAR)).toContain('tbloutbox_events');
  });
});

describe('reset classification: covers the module-scope registry', () => {
  it('every collection the registry declares is classified', () => {
    // The registry is the codebase's own inventory of collections. A
    // module added there but not here would be silently preserved --
    // meaning the "reset" leaves its data behind.
    const classified = new Set([...names(CLEAR), ...names(PRESERVE), ...names(IGNORE)]);
    const declared = MODULE_SCOPE_REGISTRY.flatMap((e) => e.collections);

    // Registry names and runtime names differ in a handful of places
    // (the registry predates some renames); only assert on those that
    // actually exist as index targets, which is the authoritative list.
    const indexSrc = fs.readFileSync(
      path.join(ROOT, 'infrastructure/database/indexes.ts'),
      'utf8'
    );
    // Exact match, not `includes`. A substring test reports
    // 'tblwebhooks' as present because 'tblwebhooksubscriptions'
    // contains it -- which is how the registry's wrong name went
    // unnoticed in the first place.
    const real = declared.filter((c) => new RegExp(`\\b${c}\\b`).test(indexSrc));

    const missing = real.filter((c) => !classified.has(c));
    expect(missing).toEqual([]);
  });
});

describe('reset script: safety properties', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/reset-business-data.ts'), 'utf8');

  it('is dry-run by default', () => {
    expect(src).toMatch(/const APPLY = has\('--confirm'\)/);
  });

  it('never drops a collection', () => {
    // deleteMany only. Dropping loses indexes, validators and collation,
    // and nothing in this script re-creates them.
    expect(src).not.toMatch(/\.drop\(\)/);
    expect(src).not.toMatch(/dropCollection/);
    expect(src).toMatch(/deleteMany/);
  });

  it('refuses to run when a collection is unclassified', () => {
    // Defaulting either way is the dangerous option; the script makes
    // the next engineer decide.
    expect(src).toMatch(/REFUSING TO RUN: \$\{unclassified\.length\} collection\(s\) are not classified/);
  });

  it('refuses a multi-tenant database without an explicit override', () => {
    expect(src).toMatch(/--yes-all-tenants/);
    expect(src).toMatch(/REFUSING TO RUN: this database holds/);
  });

  it('writes an audit record of the reset', () => {
    expect(src).toMatch(/tbltenant_repair_audit/);
    expect(src).toMatch(/BUSINESS_DATA_RESET/);
  });

  it('guards the Windows stray-backslash argument trap', () => {
    // CMD has no backslash line continuation, so a stray "\" becomes an
    // argument and silently swallows the next flag -- which here could
    // mean --tenant is dropped and the run widens to every tenant.
    expect(src).toMatch(/value === '\\\\'/);
  });
});
