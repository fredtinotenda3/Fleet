// scripts/assign-tenant.ts
//
// Assigns ownership that a HUMAN declares, for records the data itself
// cannot prove. This is the sanctioned exit from `UNRECOVERABLE`.
//
//   # see what would change
//   npx tsx scripts/assign-tenant.ts --tenant willsgrove-farm-enterprises-9e80ed
//
//   # limit to specific collections
//   npx tsx scripts/assign-tenant.ts --tenant willsgrove-farm-enterprises-9e80ed \
//        --collections tblfuelstations,tblfuelcards
//
//   # commit
//   npx tsx scripts/assign-tenant.ts --tenant willsgrove-farm-enterprises-9e80ed --apply
//
//   # a single account
//   npx tsx scripts/assign-tenant.ts --tenant willsgrove-farm-enterprises-9e80ed \
//        --account accounts@willsgrove.co.zw --apply
//
// ---------------------------------------------------------------------
// How this is NOT "guessing"
// ---------------------------------------------------------------------
// tenant-data-repair.ts refuses to assign ownership it cannot prove, and
// that is correct. But some records genuinely have no evidence in the
// database — the 16 fuel stations, 5 fuel cards, 7 report definitions and
// 8 org units left on 'default' have no organizationId, no resolvable
// creator, no parent record and no inbound references. No algorithm can
// recover them.
//
// What CAN resolve them is a person who knows the business saying so. This
// script is the audited channel for that statement. The distinction is
// strict:
//
//   tenant-data-repair.ts  DEDUCES ownership from data.       Never guesses.
//   assign-tenant.ts       RECORDS ownership a human asserts. Never deduces.
//
// Safety properties:
//   - dry run unless --apply
//   - the target tenant must be named explicitly on the command line and
//     must resolve to a real organization; no default, no inference
//   - only touches rows whose tenantId is a legacy sentinel / missing.
//     A row already owned by a real organization is NEVER reassigned, so
//     this can never move data between two live tenants.
//   - nothing is deleted, no organization is created or merged
//   - every write audited to tbltenant_repair_audit with before/after and
//     the operator's declaration recorded as the justification

import { MongoClient, Document, ObjectId } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  buildTenantIdentityIndex,
  resolveCanonical,
  toObjectIdOrNull,
} from './lib/tenant-identity';

dotenv.config();

const args = process.argv.slice(2);

/**
 * Guard against shell line-continuation that did not work.
 *
 * On Windows CMD, `\` is NOT a line-continuation character (that is `^`),
 * and PowerShell uses a backtick. A multi-line POSIX-style invocation
 * therefore delivers a bare "\" as an argument and silently DROPS every
 * flag on the following lines.
 *
 * That is dangerous here: a run intended as
 *
 *   db:assign --tenant X \
 *     --collections tblfuelstations --apply
 *
 * would arrive as `--tenant X \` — the --collections scope lost, so the
 * command would target EVERY eligible collection instead of the three the
 * operator named. Aborting is the only safe response; a scoping flag that
 * silently vanishes is worse than a syntax error.
 */
const strayContinuation = args.find((a) => a === '\\' || a === '`' || a === '^');
if (strayContinuation) {
  console.error('');
  console.error('='.repeat(74));
  console.error(' ABORTING — shell line-continuation did not work.');
  console.error('='.repeat(74));
  console.error('');
  console.error(` A bare "${strayContinuation}" arrived as an argument, which means every flag on the`);
  console.error(' following line(s) was DROPPED — including any --collections scope.');
  console.error(' Running anyway could assign far more than you intended.');
  console.error('');
  console.error(' Put the whole command on ONE line:');
  console.error('');
  console.error('   npm run db:assign -- --tenant <slug> --collections a,b,c --reason "..." --apply');
  console.error('');
  console.error(' (Windows CMD continues lines with ^, PowerShell with a backtick,');
  console.error('  bash with \\ — but one line is safest everywhere.)');
  console.error('');
  process.exit(1);
}

const APPLY = args.includes('--apply');

function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
}

const targetTenantArg = argValue('--tenant');
const collectionsArg = argValue('--collections');
const accountArg = argValue('--account');
const reasonArg = argValue('--reason') ?? 'Ownership declared by operator on the command line';

/** Business collections eligible for operator assignment. */
const ELIGIBLE_COLLECTIONS = [
  'tblvehicles',
  'tbldrivers',
  'tblexpenses',
  'tblfuellogs',
  'tbltrips',
  'tblreminders',
  'tblworkorders',
  'tblfuelcards',
  'tblfuelstations',
  'tblreportdefinitions',
  'tbldashboards',
  'tblorgunits',
  'tblnotifications',
  'tblvendors',
  'tblinvoices',
  'tblpurchaseorders',
  'tblspareparts',
  'tblstockmovements',
  'tbltelematics',
  'tblbookings',
  'tblcompliancerecords',
];

/** Only rows with no real owner are eligible. */
function unownedFilter(): Document {
  return {
    $or: [
      { tenantId: { $in: ['default', 'system', 'super_admin'] } },
      { tenantId: { $exists: false } },
      { tenantId: null },
      { tenantId: '' },
    ],
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Aborting.');
    process.exit(1);
  }
  if (!targetTenantArg) {
    console.error('');
    console.error('--tenant is required. Ownership is never inferred by this script.');
    console.error('');
    console.error('  npx tsx scripts/assign-tenant.ts --tenant <slug> [--apply]');
    console.error('    [--collections tblfuelstations,tblfuelcards]');
    console.error('    [--account someone@example.com]');
    console.error('    [--reason "why this assignment is correct"]');
    console.error('');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const identity = await buildTenantIdentityIndex(db);
  const target = resolveCanonical(identity, targetTenantArg);

  if (!target) {
    console.error('');
    console.error(`"${targetTenantArg}" does not identify a real organization.`);
    console.error('Known organizations:');
    for (const o of identity.organizations) {
      console.error(`  ${o.canonicalTenantId.padEnd(38)} ${o.name}`);
    }
    console.error('');
    await client.close();
    process.exit(1);
  }

  const org = identity.byCanonical.get(target)!;
  const runId = new ObjectId().toHexString();

  console.log('='.repeat(74));
  console.log(`ASSIGN TENANT  --  ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
  console.log(`Database:  ${db.databaseName}`);
  console.log(`Target:    ${target}   (${org.name})`);
  console.log(`Run id:    ${runId}`);
  console.log(`Reason:    ${reasonArg}`);
  console.log('='.repeat(74));

  // Guard against the duplicate-name trap: two distinct "Toyota Zimbabwe"
  // tenants exist, so a name is not a safe way to pick one.
  const sameName = identity.organizations.filter(
    (o) => o.name.trim().toLowerCase() === org.name.trim().toLowerCase()
  );
  if (sameName.length > 1) {
    console.log('');
    console.log(`  ⚠  ${sameName.length} organizations share the name "${org.name}":`);
    for (const o of sameName) {
      console.log(`       ${o.canonicalTenantId}${o.canonicalTenantId === target ? '   <-- selected' : ''}`);
    }
    console.log('     Confirm the slug above is the one you intend.');
  }

  /**
   * FIX (unintended bulk write). This used to fall back to
   * ELIGIBLE_COLLECTIONS whenever --collections was omitted. That made
   *
   *     db:assign --tenant X --account someone@example.com --apply
   *
   * — a command whose visible intent is "assign ONE account" — also sweep
   * every business collection and re-stamp every unowned row in the
   * database. It did exactly that in production: an account assignment
   * silently moved 36 rows, including 8 org-hierarchy records the operator
   * had been advised to leave alone.
   *
   * Row assignment is now OPT-IN. You get rows only if you name the
   * collections, or explicitly ask for all of them with --all-collections.
   * An --account run touches the account and nothing else.
   */
  const wantsAllCollections = args.includes('--all-collections');
  const requested = collectionsArg
    ? collectionsArg.split(',').map((c) => c.trim()).filter(Boolean)
    : wantsAllCollections
      ? ELIGIBLE_COLLECTIONS
      : [];

  if (requested.length === 0 && !accountArg) {
    console.error('');
    console.error('Nothing to do: no --collections, no --all-collections, no --account.');
    console.error('');
    console.error('  rows:    --collections tblfuelstations,tblfuelcards');
    console.error('           --all-collections        (every eligible collection)');
    console.error('  account: --account someone@example.com');
    console.error('');
    await client.close();
    process.exit(1);
  }

  const rejected = requested.filter((c) => !ELIGIBLE_COLLECTIONS.includes(c));
  if (rejected.length) {
    console.error('');
    console.error(`Not eligible for assignment: ${rejected.join(', ')}`);
    console.error('Eligible: ' + ELIGIBLE_COLLECTIONS.join(', '));
    await client.close();
    process.exit(1);
  }

  const plan: Array<{ collection: string; documentId: string; before: unknown; identity: Document }> = [];
  const accountPlan: Array<{ userId: string; email: string; before: unknown }> = [];

  // ---- accounts ------------------------------------------------------
  if (accountArg) {
    const u = await db.collection('tbladmin').findOne({ Email: accountArg });
    if (!u) {
      console.error(`\nNo account found with email ${accountArg}.`);
      await client.close();
      process.exit(1);
    }
    const existing = resolveCanonical(identity, u.tenantId);
    if (existing && existing !== target) {
      console.error('');
      console.error(`REFUSING: ${accountArg} already belongs to "${existing}".`);
      console.error('This script never moves an account between two live tenants.');
      console.error('If that is genuinely intended, change it deliberately and');
      console.error('record why — not through a bulk assignment tool.');
      await client.close();
      process.exit(1);
    }
    if (existing === target) {
      console.log(`\n  ${accountArg} already belongs to ${target}. Nothing to do.`);
    } else {
      accountPlan.push({ userId: String(u._id), email: accountArg, before: u.tenantId ?? null });
    }
  }

  // ---- business rows -------------------------------------------------
  console.log('');
  console.log('-'.repeat(74));
  console.log('RECORDS WITH NO OWNER (eligible for assignment)');
  console.log('-'.repeat(74));

  if (requested.length === 0) {
    console.log('  (no collections requested — rows untouched)');
    console.log('  Add --collections <list> or --all-collections to assign rows.');
  }

  for (const name of requested) {
    if ((await db.listCollections({ name }).toArray()).length === 0) continue;
    const docs = await db.collection(name).find(unownedFilter()).toArray();
    if (docs.length === 0) continue;
    console.log(`  ${name.padEnd(26)} ${String(docs.length).padStart(5)} row(s)`);
    for (const d of docs) {
      plan.push({
        collection: name,
        documentId: String(d._id),
        before: d.tenantId ?? null,
        identity: {
          name: d.name,
          license_plate: d.license_plate,
          code: d.code,
          card_number: d.card_number,
          isDeleted: d.isDeleted,
        },
      });
    }
  }
  if (plan.length === 0 && requested.length > 0)
    console.log('  (none — nothing left to assign)');

  // ---- plan export ---------------------------------------------------
  const reportDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const planPath = path.join(reportDir, `tenant-assignment-plan-${stamp}.json`);
  fs.writeFileSync(
    planPath,
    JSON.stringify(
      {
        runId,
        generatedAt: new Date().toISOString(),
        mode: APPLY ? 'apply' : 'dry-run',
        targetTenantId: target,
        targetOrganizationName: org.name,
        declaredReason: reasonArg,
        accountAssignments: accountPlan,
        rowAssignments: plan,
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log('');
  console.log('='.repeat(74));
  console.log('PLAN');
  console.log('='.repeat(74));
  console.log(`  account assignments .... ${accountPlan.length}`);
  console.log(`  row assignments ........ ${plan.length}`);
  console.log(`  reassignments of already-owned rows ... 0  (refused by design)`);
  console.log(`  deletions .............. 0`);
  console.log('');
  console.log(`  Plan written to reports/${path.basename(planPath)}`);

  if (!APPLY) {
    console.log('');
    console.log('  DRY RUN — nothing written. Re-run with --apply to commit.');
    await client.close();
    return;
  }

  const audit = db.collection('tbltenant_repair_audit');
  let written = 0;

  for (const a of accountPlan) {
    const oid = toObjectIdOrNull(a.userId);
    if (!oid) continue;
    const res = await db
      .collection('tbladmin')
      .updateOne({ _id: oid }, { $set: { tenantId: target, tenantAssignedAt: new Date() } });
    if (res.modifiedCount) {
      written += 1;
      await audit.insertOne({
        runId,
        at: new Date(),
        collection: 'tbladmin',
        documentId: a.userId,
        field: 'tenantId',
        before: a.before,
        after: target,
        ladder: 'OPERATOR_DECLARED',
        declaredReason: reasonArg,
        email: a.email,
        actor: 'scripts/assign-tenant.ts',
      });
    }
  }

  for (const r of plan) {
    const oid = toObjectIdOrNull(r.documentId);
    if (!oid) continue;
    // Re-assert the unowned condition at write time so a concurrent
    // repair run cannot have taken ownership in between.
    const res = await db.collection(r.collection).updateOne(
      { _id: oid, ...unownedFilter() },
      { $set: { tenantId: target, tenantAssignedAt: new Date() } }
    );
    if (res.modifiedCount) {
      written += 1;
      await audit.insertOne({
        runId,
        at: new Date(),
        collection: r.collection,
        documentId: r.documentId,
        field: 'tenantId',
        before: r.before,
        after: target,
        ladder: 'OPERATOR_DECLARED',
        declaredReason: reasonArg,
        identity: r.identity,
        actor: 'scripts/assign-tenant.ts',
      });
    }
  }

  console.log('');
  console.log(`  APPLIED: ${written} document(s) assigned to ${target}.`);
  console.log(`  Audit trail: db.tbltenant_repair_audit.find({ runId: "${runId}" })`);
  console.log('  Re-run `npm run db:forensics` to confirm.');

  await client.close();
}

main().catch((err) => {
  console.error('Assignment failed:', err);
  process.exit(1);
});
