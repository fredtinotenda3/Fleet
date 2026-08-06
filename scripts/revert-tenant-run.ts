// scripts/revert-tenant-run.ts
//
// Rolls back a tenant repair or assignment run using its audit trail.
//
//   npx tsx scripts/revert-tenant-run.ts --run-id <id>
//   npx tsx scripts/revert-tenant-run.ts --run-id <id> --apply
//   npx tsx scripts/revert-tenant-run.ts --run-id <id> --collections tblorgunits --apply
//
// Every write made by tenant-data-repair.ts and assign-tenant.ts is logged
// to tbltenant_repair_audit with the exact `before` value. That makes those
// runs reversible, which is the point of auditing them in the first place.
//
// Why this exists: an `--account` invocation of assign-tenant.ts used to
// also sweep every business collection (fixed — row assignment is now
// opt-in). A production run assigned 36 rows when the operator intended to
// assign one account. This is the clean way back.
//
// Safety:
//   - dry run unless --apply
//   - reverts ONLY documents whose current value still matches what the run
//     wrote. If something changed afterwards, that document is skipped and
//     reported, never clobbered.
//   - --collections narrows the revert to specific collections, so you can
//     undo part of a run and keep the rest.
//   - the revert is itself audited, with a new runId.
//   - nothing is deleted.

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import { toObjectIdOrNull } from './lib/tenant-identity';

dotenv.config();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

const stray = args.find((a) => a === '\\' || a === '`' || a === '^');
if (stray) {
  console.error(`\nABORTING — a bare "${stray}" arrived as an argument, so flags on the`);
  console.error('following line(s) were dropped. Put the command on one line.\n');
  process.exit(1);
}

function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
}

const runId = argValue('--run-id');
const collectionsArg = argValue('--collections');

const AUDIT_COLLECTION = 'tbltenant_repair_audit';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Aborting.');
    process.exit(1);
  }
  if (!runId) {
    console.error('');
    console.error('--run-id is required.');
    console.error('');
    console.error('  List recent runs:');
    console.error(`    db.${AUDIT_COLLECTION}.distinct("runId")`);
    console.error('');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const filter: Record<string, unknown> = { runId };
  if (collectionsArg) {
    filter.collection = { $in: collectionsArg.split(',').map((c) => c.trim()).filter(Boolean) };
  }

  const entries = await db.collection(AUDIT_COLLECTION).find(filter).toArray();

  console.log('='.repeat(74));
  console.log(`REVERT TENANT RUN  --  ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
  console.log(`Database: ${db.databaseName}`);
  console.log(`Run id:   ${runId}`);
  if (collectionsArg) console.log(`Scope:    ${collectionsArg}`);
  console.log('='.repeat(74));

  if (entries.length === 0) {
    console.log('');
    console.log('  No audit entries found for that run id (and scope).');
    console.log(`  Available runs: db.${AUDIT_COLLECTION}.distinct("runId")`);
    await client.close();
    return;
  }

  const byCollection = new Map<string, number>();
  for (const e of entries) {
    byCollection.set(String(e.collection), (byCollection.get(String(e.collection)) ?? 0) + 1);
  }

  console.log('');
  console.log('  Entries in this run:');
  for (const [c, n] of [...byCollection].sort()) {
    console.log(`    ${c.padEnd(28)} ${String(n).padStart(5)}`);
  }

  const revertable: typeof entries = [];
  const changedSince: typeof entries = [];

  for (const e of entries) {
    const oid = toObjectIdOrNull(String(e.documentId));
    if (!oid) continue;
    const current = await db.collection(String(e.collection)).findOne({ _id: oid });
    if (!current) continue;
    // Only revert if the value we wrote is still the value there.
    if (current.tenantId === e.after) revertable.push(e);
    else changedSince.push(e);
  }

  console.log('');
  console.log('='.repeat(74));
  console.log('PLAN');
  console.log('='.repeat(74));
  console.log(`  revertable ......................... ${revertable.length}`);
  console.log(`  changed since the run (skipped) .... ${changedSince.length}`);
  console.log(`  deletions .......................... 0`);

  if (changedSince.length > 0) {
    console.log('');
    console.log('  Skipped — these were modified after the run, so reverting would');
    console.log('  overwrite a newer decision:');
    for (const e of changedSince.slice(0, 20)) {
      console.log(`    ${String(e.collection)}/${String(e.documentId)}`);
    }
    if (changedSince.length > 20) console.log(`    ... and ${changedSince.length - 20} more`);
  }

  if (!APPLY) {
    console.log('');
    console.log('  DRY RUN — nothing written. Re-run with --apply to commit.');
    await client.close();
    return;
  }

  const revertRunId = new ObjectId().toHexString();
  const audit = db.collection(AUDIT_COLLECTION);
  let reverted = 0;

  for (const e of revertable) {
    const oid = toObjectIdOrNull(String(e.documentId));
    if (!oid) continue;

    // A null/undefined `before` means the field did not exist; restore that
    // absence rather than writing a literal null.
    const update =
      e.before === null || e.before === undefined
        ? { $unset: { tenantId: '' as const, tenantAssignedAt: '' as const, tenantRepairedAt: '' as const } }
        : {
            $set: { tenantId: e.before },
            $unset: { tenantAssignedAt: '' as const, tenantRepairedAt: '' as const },
          };

    const res = await db
      .collection(String(e.collection))
      .updateOne({ _id: oid, tenantId: e.after }, update);

    if (res.modifiedCount) {
      reverted += 1;
      await audit.insertOne({
        runId: revertRunId,
        revertOf: runId,
        at: new Date(),
        collection: e.collection,
        documentId: e.documentId,
        field: 'tenantId',
        before: e.after,
        after: e.before ?? null,
        ladder: 'REVERT',
        actor: 'scripts/revert-tenant-run.ts',
      });
    }
  }

  console.log('');
  console.log(`  REVERTED: ${reverted} document(s).`);
  console.log(`  This revert is itself audited as runId "${revertRunId}".`);
  console.log('  Re-run `npm run db:forensics` to confirm.');

  await client.close();
}

main().catch((err) => {
  console.error('Revert failed:', err);
  process.exit(1);
});
