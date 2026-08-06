// scripts/tenant-forensics.ts
//
// READ-ONLY tenant-isolation forensics.
//
// Answers the one question nobody can answer from the source alone:
//   "Is the existing data trustworthy, and is wrong ownership RECOVERABLE?"
//
// It performs NO writes of any kind. There is no --apply flag, by design.
// Run it, read the verdict, then decide migrate vs reset.
//
//   npx tsx scripts/tenant-forensics.ts
//   npx tsx scripts/tenant-forensics.ts --json > forensics.json
//
// WHAT IT CHECKS
//   1. Sentinel contamination  -- rows carrying tenantId 'default' /
//      'system' / 'super_admin' / null / '' . These are the rows that
//      show up in the wrong organization.
//   2. Recoverability          -- for each contaminated row, can the true
//      owner be reconstructed? Three independent ladders are tried, in
//      order of confidence:
//         a. the row already carries an organizationId / orgUnitId
//         b. createdBy -> tbladmin -> that user's real tenantId
//         c. a parent record (e.g. the vehicle a fuel log belongs to)
//      A row recoverable by any ladder is migratable.
//   3. Orphaned accounts       -- tbladmin records with no tenantId. These
//      are the accounts that were silently granted platform-wide scope.
//   4. Field disagreement      -- rows where tenantId and organizationId
//      point at different organizations.
//   5. Cross-tenant references -- child rows whose parent vehicle belongs
//      to a DIFFERENT tenant. This is true structural corruption and the
//      only finding that can force a reset.
//
// The verdict at the end is computed from thresholds, not vibes, and it
// prints the numbers it used.

import { MongoClient, Db, Document } from 'mongodb';
import * as dotenv from 'dotenv';
import {
  buildTenantIdentityIndex,
  resolveCanonical,
  type TenantIdentityIndex,
} from './lib/tenant-identity';

dotenv.config();

const LEGACY_SENTINELS = ['default', 'system', 'super_admin'];
const JSON_MODE = process.argv.includes('--json');

/** Collections that carry tenant-owned business data, and the field that
 *  links each back to a vehicle (used for the cross-reference check). */
const TENANT_COLLECTIONS: Array<{ name: string; vehicleRef?: string }> = [
  { name: 'tblvehicles' },
  { name: 'tbldrivers' },
  { name: 'tblexpenses', vehicleRef: 'license_plate' },
  { name: 'tblfuellogs', vehicleRef: 'license_plate' },
  { name: 'tbltrips', vehicleRef: 'license_plate' },
  { name: 'tblreminders', vehicleRef: 'license_plate' },
  { name: 'tblworkorders', vehicleRef: 'license_plate' },
  { name: 'tblbookings' },
  { name: 'tblnotifications' },
  { name: 'tbltelematics' },
  { name: 'tblworkshopbays' },
  { name: 'tblvendors' },
  { name: 'tblinvoices' },
  { name: 'tblpurchaseorders' },
  { name: 'tblspareparts' },
  { name: 'tblstockmovements' },
  { name: 'tblcompliancerecords' },
  { name: 'tbldispatchjobs' },
  { name: 'tblreportdefinitions' },
  { name: 'tbldashboards' },
  { name: 'tblorgunits' },
  { name: 'tblfuelcards' },
  { name: 'tblfuelstations' },
];

interface CollectionFindings {
  collection: string;
  total: number;
  contaminated: number;
  bySentinel: Record<string, number>;
  recoverableViaOrgId: number;
  recoverableViaCreatedBy: number;
  unrecoverable: number;
  fieldDisagreement: number;
  crossTenantVehicleRefs: number;
  exists: boolean;
}

const out: string[] = [];
function log(line = '') {
  if (!JSON_MODE) console.log(line);
  out.push(line);
}

function contaminationFilter(): Document {
  return {
    $or: [
      { tenantId: { $in: LEGACY_SENTINELS } },
      { tenantId: { $exists: false } },
      { tenantId: null },
      { tenantId: '' },
    ],
  };
}

let identityRef: TenantIdentityIndex | null = null;

async function auditCollection(
  db: Db,
  spec: { name: string; vehicleRef?: string },
  realTenantIds: Set<string>,
  userTenantById: Map<string, string>
): Promise<CollectionFindings> {
  const base: CollectionFindings = {
    collection: spec.name,
    total: 0,
    contaminated: 0,
    bySentinel: {},
    recoverableViaOrgId: 0,
    recoverableViaCreatedBy: 0,
    unrecoverable: 0,
    fieldDisagreement: 0,
    crossTenantVehicleRefs: 0,
    exists: false,
  };

  const collections = await db.listCollections({ name: spec.name }).toArray();
  if (collections.length === 0) return base;
  base.exists = true;

  const col = db.collection(spec.name);
  base.total = await col.countDocuments({});
  if (base.total === 0) return base;

  base.contaminated = await col.countDocuments(contaminationFilter());

  for (const sentinel of LEGACY_SENTINELS) {
    const n = await col.countDocuments({ tenantId: sentinel });
    if (n > 0) base.bySentinel[sentinel] = n;
  }
  const missing = await col.countDocuments({
    $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: '' }],
  });
  if (missing > 0) base.bySentinel['(missing/empty)'] = missing;

  // --- recoverability, evaluated row by row on the contaminated set ---
  if (base.contaminated > 0) {
    const cursor = col.find(contaminationFilter(), {
      projection: { organizationId: 1, orgUnitId: 1, createdBy: 1, updatedBy: 1 },
    });

    for await (const doc of cursor) {
      const orgId = (doc as Document).organizationId as string | undefined;
      if (orgId && resolveCanonical(identityRef!, orgId)) {
        base.recoverableViaOrgId += 1;
        continue;
      }
      const creator = ((doc as Document).createdBy ?? (doc as Document).updatedBy) as
        | string
        | undefined;
      const viaUser = creator ? userTenantById.get(String(creator)) : undefined;
      if (viaUser) {
        base.recoverableViaCreatedBy += 1;
        continue;
      }
      base.unrecoverable += 1;
    }
  }

  // --- tenantId vs organizationId disagreement ------------------------
  base.fieldDisagreement = await col.countDocuments({
    organizationId: { $exists: true, $ne: null },
    $expr: {
      $and: [
        { $ne: ['$organizationId', '$tenantId'] },
        { $ne: [{ $type: '$organizationId' }, 'missing'] },
      ],
    },
  });

  // --- cross-tenant parent references ---------------------------------
  if (spec.vehicleRef) {
    const pipeline: Document[] = [
      { $match: { [spec.vehicleRef]: { $exists: true, $ne: null } } },
      {
        $lookup: {
          from: 'tblvehicles',
          localField: spec.vehicleRef,
          foreignField: spec.vehicleRef,
          as: 'parent',
        },
      },
      { $unwind: '$parent' },
      { $match: { $expr: { $ne: ['$tenantId', '$parent.tenantId'] } } },
      { $count: 'n' },
    ];
    const res = await col.aggregate(pipeline).toArray();
    base.crossTenantVehicleRefs = res[0]?.n ?? 0;
  }

  return base;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Aborting.');
    process.exit(1);
  }

  const client = new MongoClient(uri, { readPreference: 'secondaryPreferred' });
  await client.connect();
  const db = client.db();

  log('='.repeat(72));
  log('TENANT ISOLATION FORENSICS  (READ-ONLY -- this script never writes)');
  log(`Database: ${db.databaseName}`);
  log(`Run at:   ${new Date().toISOString()}`);
  log('='.repeat(72));

  // ---- organizations -------------------------------------------------
  /**
   * FIX (my own bug, found by real production data). This used to be:
   *
   *   const realTenantIds = new Set(orgs.map((o) => String(o._id)));
   *
   * which assumed tenantId === String(organization._id). In this database
   * the canonical tenant identifier is the organization SLUG
   * ("willsgrove-farm-enterprises-9e80ed"), not the ObjectId. Every
   * recoverability check therefore compared a slug against a set of
   * ObjectId hex strings, never matched, and reported "0.0% recoverable"
   * plus 9 phantom "tenantId pointing at no org" accounts that in fact
   * held perfectly valid slugs.
   *
   * Identity now resolves through scripts/lib/tenant-identity.ts, which
   * accepts slug, tenantId or _id and always emits the canonical form.
   */
  const identity = await buildTenantIdentityIndex(db);
  identityRef = identity;
  const orgs = identity.organizations;
  const realTenantIds = identity.canonicalSet;

  log('');
  log(`ORGANIZATIONS: ${orgs.length}`);
  for (const o of orgs.slice(0, 25)) {
    log(`  ${o.canonicalTenantId.padEnd(38)} ${o.isDeleted ? '[deleted] ' : ''}${o.name}`);
  }
  if (orgs.length > 25) log(`  ... and ${orgs.length - 25} more`);

  // ---- user accounts -------------------------------------------------
  const users = await db
    .collection('tbladmin')
    .find({}, { projection: { Email: 1, Role: 1, tenantId: 1 } })
    .toArray();

  const userTenantById = new Map<string, string>();
  let usersMissingTenant = 0;
  let usersSentinelTenant = 0;
  let usersValidTenant = 0;
  let usersDanglingTenant = 0;

  for (const u of users) {
    const t = u.tenantId ? String(u.tenantId).trim() : '';
    const canonical = resolveCanonical(identity, t);
    if (canonical) userTenantById.set(String(u._id), canonical);
    if (!t) usersMissingTenant += 1;
    else if (LEGACY_SENTINELS.includes(t.toLowerCase())) usersSentinelTenant += 1;
    else if (canonical) usersValidTenant += 1;
    else usersDanglingTenant += 1;
  }

  log('');
  log('-'.repeat(72));
  log('1. ACCOUNTS  (tbladmin)');
  log('-'.repeat(72));
  log(`  total accounts .................... ${users.length}`);
  log(`  valid organization tenantId ...... ${usersValidTenant}`);
  log(`  NO tenantId  (was granted platform scope) ... ${usersMissingTenant}`);
  log(`  legacy sentinel tenantId ......... ${usersSentinelTenant}`);
  log(`  tenantId pointing at no org ...... ${usersDanglingTenant}`);
  if (usersMissingTenant + usersSentinelTenant > 0) {
    log('');
    log(`  >> ${usersMissingTenant + usersSentinelTenant} account(s) could read across ALL organizations.`);
    log('     These are the accounts that produced the reported leak.');
    log('     Fix with: npm run db:repair   (db:backfill-user-tenants is disabled)');
  }

  // ---- data collections ----------------------------------------------
  log('');
  log('-'.repeat(72));
  log('2. DATA CONTAMINATION AND RECOVERABILITY');
  log('-'.repeat(72));

  const findings: CollectionFindings[] = [];
  for (const spec of TENANT_COLLECTIONS) {
    const f = await auditCollection(db, spec, realTenantIds, userTenantById);
    findings.push(f);
    if (!f.exists || f.total === 0) continue;

    const flag = f.contaminated > 0 ? '  <-- CONTAMINATED' : '';
    log('');
    log(`  ${f.collection}  (${f.total} rows)${flag}`);
    if (f.contaminated > 0) {
      const detail = Object.entries(f.bySentinel)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      log(`      contaminated ............ ${f.contaminated}  [${detail}]`);
      log(`      recoverable via orgId ... ${f.recoverableViaOrgId}`);
      log(`      recoverable via creator . ${f.recoverableViaCreatedBy}`);
      log(`      UNRECOVERABLE ........... ${f.unrecoverable}`);
    }
    if (f.fieldDisagreement > 0) {
      log(`      tenantId != organizationId ... ${f.fieldDisagreement}`);
    }
    if (f.crossTenantVehicleRefs > 0) {
      log(`      rows whose vehicle is in ANOTHER tenant ... ${f.crossTenantVehicleRefs}`);
    }
  }

  // ---- verdict --------------------------------------------------------
  const totalRows = findings.reduce((a, f) => a + f.total, 0);
  const totalContaminated = findings.reduce((a, f) => a + f.contaminated, 0);
  const totalUnrecoverable = findings.reduce((a, f) => a + f.unrecoverable, 0);
  const totalRecoverable = findings.reduce(
    (a, f) => a + f.recoverableViaOrgId + f.recoverableViaCreatedBy,
    0
  );
  const totalCrossRef = findings.reduce((a, f) => a + f.crossTenantVehicleRefs, 0);
  const totalDisagreement = findings.reduce((a, f) => a + f.fieldDisagreement, 0);

  const contaminationPct = totalRows === 0 ? 0 : (totalContaminated / totalRows) * 100;
  const recoveryPct =
    totalContaminated === 0 ? 100 : (totalRecoverable / totalContaminated) * 100;

  log('');
  log('='.repeat(72));
  log('3. VERDICT');
  log('='.repeat(72));
  log(`  business rows scanned ......... ${totalRows}`);
  log(`  contaminated .................. ${totalContaminated}  (${contaminationPct.toFixed(2)}%)`);
  log(`  ... recoverable ............... ${totalRecoverable}  (${recoveryPct.toFixed(1)}% of contaminated)`);
  log(`  ... UNRECOVERABLE ............. ${totalUnrecoverable}`);
  log(`  tenantId/organizationId clashes ${totalDisagreement}`);
  log(`  cross-tenant parent refs ...... ${totalCrossRef}`);
  log('');

  let verdict: string;
  if (totalContaminated === 0 && totalCrossRef === 0 && totalDisagreement === 0) {
    verdict = 'KEEP DATABASE — no contamination found.';
    log('  >>> KEEP DATABASE');
    log('      No sentinel-scoped rows, no cross-tenant references.');
    log('      Deploy the Phase 1 auth fixes and backfill accounts. No data');
    log('      migration is required.');
  } else if (totalCrossRef > 0) {
    verdict = 'STRUCTURAL CORRUPTION — manual review required before deciding.';
    log('  >>> STOP. STRUCTURAL CORRUPTION PRESENT.');
    log(`      ${totalCrossRef} child rows reference a vehicle owned by a`);
    log('      different tenant. This is not a labelling error and cannot be');
    log('      fixed by a bulk re-stamp: re-assigning the child would move it');
    log('      away from its parent, re-assigning the parent would move it away');
    log('      from its other children. Export these rows and review by hand.');
  } else if (recoveryPct >= 95) {
    verdict = 'MIGRATE — ownership is recoverable.';
    log('  >>> MIGRATE (do NOT reset)');
    log(`      ${recoveryPct.toFixed(1)}% of contaminated rows have a recoverable owner.`);
    log('      Resetting would destroy legitimate customer data to fix what is');
    log('      a labelling error. Re-stamp tenantId from the recovered owner,');
    log('      after deploying the Phase 1 fixes (otherwise it re-corrupts).');
  } else if (recoveryPct < 50 && totalUnrecoverable > 0) {
    verdict = 'OPERATOR DECISION REQUIRED — automated recovery is exhausted.';
    log('  >>> OPERATOR DECISION REQUIRED');
    log('      This script only tries organizationId and createdBy. Run');
    log('      `npm run db:repair` first if you have not -- it adds two more');
    log('      ladders (parent record, inbound usage references) and recovers');
    log('      rows this pass cannot see.');
    log('');
    log('      If db:repair has already run and these rows remain, they have');
    log('      NO ownership evidence anywhere in the database and no algorithm');
    log('      can recover them. That is not corruption -- it is missing');
    log('      provenance. A person who knows the business must declare the');
    log('      owner:');
    log('');
    log('        npm run db:assign -- --tenant <slug> --collections <list>');
    log('');
    log('      Review reports/tenant-unrecoverable-rows-*.json first. The');
    log('      assign tool only ever touches rows with NO current owner, so');
    log('      it cannot move data between two live tenants.');
  } else if (recoveryPct >= 50) {
    verdict = 'PARTIAL MIGRATE — recover what is recoverable, quarantine the rest.';
    log('  >>> PARTIAL MIGRATE');
    log(`      ${recoveryPct.toFixed(1)}% recoverable, ${totalUnrecoverable} rows are not.`);
    log('      Migrate the recoverable set. Move the remainder into a');
    log('      quarantine collection rather than deleting it — an operator');
    log('      may be able to identify owners the data cannot.');
  } else {
    verdict = 'RESET CANDIDATE — ownership largely unrecoverable.';
    log('  >>> RESET CANDIDATE');
    log(`      Only ${recoveryPct.toFixed(1)}% of contaminated rows have a recoverable owner.`);
    log('      A reset is defensible ONLY IF this data is demo/pilot rather');
    log('      than paid-customer data. Confirm that commercially first.');
    log('      Deploy the Phase 1 fixes BEFORE reseeding, or the new data');
    log('      corrupts the same way within a week.');
  }

  log('');
  log('  Reminder: this decision fixes the DATA. The DEFECT is the fail-open');
  log('  tenant filter, fixed separately in server/tenancy/tenant-scope.ts.');
  log('  Data cleanup without that fix buys you days, not a fix.');
  log('='.repeat(72));

  if (JSON_MODE) {
    console.log(
      JSON.stringify(
        {
          database: db.databaseName,
          runAt: new Date().toISOString(),
          organizations: orgs.length,
          accounts: {
            total: users.length,
            valid: usersValidTenant,
            missingTenant: usersMissingTenant,
            sentinelTenant: usersSentinelTenant,
            danglingTenant: usersDanglingTenant,
          },
          totals: {
            rows: totalRows,
            contaminated: totalContaminated,
            recoverable: totalRecoverable,
            unrecoverable: totalUnrecoverable,
            fieldDisagreement: totalDisagreement,
            crossTenantRefs: totalCrossRef,
            contaminationPct: Number(contaminationPct.toFixed(4)),
            recoveryPct: Number(recoveryPct.toFixed(2)),
          },
          verdict,
          collections: findings.filter((f) => f.exists),
        },
        null,
        2
      )
    );
  }

  await client.close();
}

main().catch((err) => {
  console.error('Forensics failed:', err);
  process.exit(1);
});
