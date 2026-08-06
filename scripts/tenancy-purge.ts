// scripts/tenancy-purge.ts
//
// Removes every organization EXCEPT one, and all data belonging to them.
//
// ---------------------------------------------------------------------
// READ THIS FIRST
// ---------------------------------------------------------------------
// This is the only destructive script in the tenancy toolchain. It is
// deliberately separate from tenancy-provision.ts: destroying a
// customer's data must never be a side effect of a command whose name
// suggests it creates things.
//
// Guards, in order of how much they will annoy you:
//
//   1. DRY RUN BY DEFAULT.
//   2. --confirm is not sufficient. You must ALSO pass
//      --i-understand-this-deletes-data. Two independent flags, because
//      --confirm is muscle memory across the other scripts in this
//      repository and muscle memory is exactly what you do not want
//      driving a delete.
//   3. The organization to KEEP must be named explicitly with --keep.
//      There is no default. A typo'd slug aborts rather than falling
//      back to "the first one" and deleting the real customer.
//   4. SOFT DELETE by default (isDeleted: true). --hard is a further
//      opt-in. Soft delete is reversible; the rows stay queryable by a
//      platform admin and can be restored.
//   5. A JSON export of everything about to be removed is written to
//      ./reports/ BEFORE any deletion, unless --skip-export is passed.
//
// Note on the two "Toyota Zimbabwe" organizations: the earlier forensics
// found two DISTINCT tenants sharing a display name
// (toyota-zimbabwe-63078f and toyota-zimbabwe-949d94). This script
// matches on the canonical tenant id only, never on name, so it cannot
// conflate them.
//
// Usage:
//   npm run tenancy:purge -- --keep willsgrove-farm-enterprises-9e80ed
//   npm run tenancy:purge -- --keep <slug> --confirm --i-understand-this-deletes-data

/* eslint-disable no-console */

import { MongoClient, Db } from 'mongodb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const argv = process.argv.slice(2);

if (argv.includes('\\')) {
  console.error(`${RED}Refusing to run: literal "\\" argument (Windows CMD continuation).${RESET}`);
  process.exit(1);
}

function value(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

const KEEP = value('keep');
const APPLY = argv.includes('--confirm');
const ACKNOWLEDGED = argv.includes('--i-understand-this-deletes-data');
const HARD = argv.includes('--hard');
const SKIP_EXPORT = argv.includes('--skip-export');

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`${RED}MONGODB_URI is not set.${RESET}`);
    process.exit(1);
  }

  if (!KEEP) {
    console.error('');
    console.error(`${RED}--keep is required.${RESET}`);
    console.error('');
    console.error('  Name the organization to PRESERVE, by canonical tenant id:');
    console.error('');
    console.error('    npm run tenancy:purge -- --keep willsgrove-farm-enterprises-9e80ed');
    console.error('');
    console.error(`  ${DIM}There is no default. A script that guesses which customer to${RESET}`);
    console.error(`  ${DIM}keep is a script that eventually deletes the wrong one.${RESET}`);
    console.error('');
    console.error('  Run `npm run tenancy:report` to list the organizations present.');
    console.error('');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  try {
    const orgs = await db.collection('tblorganizations').find({}).toArray();

    const identify = (o: Record<string, unknown>): string =>
      (typeof o.tenantId === 'string' && o.tenantId.trim()) ||
      (typeof o.slug === 'string' && o.slug.trim()) ||
      String(o._id);

    const keeper = orgs.find((o) => identify(o) === KEEP);
    if (!keeper) {
      console.error('');
      console.error(`${RED}No organization has tenant id "${KEEP}".${RESET}`);
      console.error('');
      console.error('  Present:');
      for (const o of orgs) {
        console.error(`    ${identify(o).padEnd(40)} ${o.name ?? ''}`);
      }
      console.error('');
      console.error(`  ${DIM}Aborting rather than guessing.${RESET}`);
      console.error('');
      process.exit(1);
    }

    const doomed = orgs.filter((o) => identify(o) !== KEEP);
    const doomedIds = doomed.map(identify);

    console.log('');
    console.log(`${BOLD}Tenancy purge${RESET}`);
    console.log(`${DIM}${'='.repeat(74)}${RESET}`);
    console.log(`  ${GREEN}KEEP${RESET}   ${identify(keeper).padEnd(40)} ${keeper.name ?? ''}`);
    for (const o of doomed) {
      console.log(`  ${RED}REMOVE${RESET} ${identify(o).padEnd(40)} ${o.name ?? ''}`);
    }
    console.log('');
    console.log(
      `  Mode: ${APPLY && ACKNOWLEDGED ? `${RED}APPLY${RESET}` : `${YELLOW}DRY RUN${RESET}`}` +
        `   Deletion: ${HARD ? `${RED}HARD (irreversible)${RESET}` : `${GREEN}SOFT (reversible)${RESET}`}`
    );
    console.log('');

    if (doomed.length === 0) {
      console.log(`${GREEN}Only the kept organization exists. Nothing to do.${RESET}`);
      console.log('');
      return;
    }

    // ── Count what would go ──────────────────────────────────────────

    const collections = await db.listCollections().toArray();
    const counts: Array<{ collection: string; count: number }> = [];
    let total = 0;

    for (const info of collections) {
      const name = info.name;
      if (name.startsWith('system.')) continue;
      const count = await db
        .collection(name)
        .countDocuments({ tenantId: { $in: doomedIds } });
      if (count > 0) {
        counts.push({ collection: name, count });
        total += count;
      }
    }

    console.log(`${BOLD}Rows belonging to removed organizations${RESET}`);
    for (const c of counts.sort((a, b) => b.count - a.count)) {
      console.log(`  ${c.collection.padEnd(38)} ${String(c.count).padStart(7)}`);
    }
    console.log(`  ${DIM}${'-'.repeat(46)}${RESET}`);
    console.log(`  ${BOLD}${'total'.padEnd(38)} ${String(total).padStart(7)}${RESET}`);
    console.log('');

    // Accounts are handled separately: an account may legitimately have
    // no tenantId (a platform super admin) and must NOT be swept up.
    const doomedAccounts = await db
      .collection('tbladmin')
      .find({ tenantId: { $in: doomedIds } })
      .toArray();

    console.log(`${BOLD}Accounts${RESET}`);
    for (const a of doomedAccounts) {
      console.log(`  ${RED}remove${RESET} ${String(a.Email ?? '').padEnd(40)} ${a.Role ?? ''}`);
    }
    const preserved = await db
      .collection('tbladmin')
      .countDocuments({
        $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: '' }],
      });
    if (preserved > 0) {
      console.log(
        `  ${GREEN}keep${RESET}   ${preserved} account(s) with no tenantId ${DIM}(platform admins -- never purged)${RESET}`
      );
    }
    console.log('');

    if (!APPLY || !ACKNOWLEDGED) {
      console.log(`${YELLOW}DRY RUN -- nothing was written.${RESET}`);
      console.log('');
      console.log('  To actually delete, BOTH flags are required:');
      console.log('');
      console.log(
        `    npm run tenancy:purge -- --keep ${KEEP} ${BOLD}--confirm --i-understand-this-deletes-data${RESET}`
      );
      console.log('');
      if (!HARD) {
        console.log(`  ${DIM}Add --hard for irreversible deletion. Without it, rows are${RESET}`);
        console.log(`  ${DIM}soft-deleted (isDeleted: true) and can be restored.${RESET}`);
      }
      console.log('');
      return;
    }

    // ── Export before destroying ─────────────────────────────────────

    if (!SKIP_EXPORT) {
      const dir = path.resolve(process.cwd(), 'reports');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `purge-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

      const dump: Record<string, unknown[]> = {};
      for (const c of counts) {
        dump[c.collection] = await db
          .collection(c.collection)
          .find({ tenantId: { $in: doomedIds } })
          .toArray();
      }
      fs.writeFileSync(file, JSON.stringify(dump, null, 2));
      console.log(`${GREEN}Exported ${total} rows to ${file}${RESET}`);
      console.log('');
    }

    // ── Delete ───────────────────────────────────────────────────────

    let removed = 0;
    for (const c of counts) {
      const result = HARD
        ? await db.collection(c.collection).deleteMany({ tenantId: { $in: doomedIds } })
        : await db
            .collection(c.collection)
            .updateMany(
              { tenantId: { $in: doomedIds } },
              { $set: { isDeleted: true, deletedAt: new Date(), deletedByScript: 'tenancy-purge' } }
            );

      const n = HARD
        ? (result as { deletedCount: number }).deletedCount
        : (result as { modifiedCount: number }).modifiedCount;
      removed += n;
      console.log(`  ${c.collection.padEnd(38)} ${String(n).padStart(7)} ${HARD ? 'deleted' : 'soft-deleted'}`);
    }

    console.log('');
    console.log(`${GREEN}Purge complete.${RESET} ${removed} rows ${HARD ? 'deleted' : 'soft-deleted'}.`);
    console.log('');
    console.log(`${BOLD}Next:${RESET}`);
    console.log(`  npm run tenancy:provision -- --org ${KEEP} --confirm`);
    console.log('  npm run tenancy:backfill -- --confirm');
    console.log('  npm run tenancy:report');
    console.log('');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('');
  console.error(`${RED}Purge failed:${RESET}`, error instanceof Error ? error.message : error);
  process.exit(1);
});
