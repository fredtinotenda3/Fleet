// scripts/remove-duplicate-fuel-logs.ts
//
// ONE-TIME CLEANUP – removes duplicate fuel log entries that share the
// same natural dedup key (license_plate + calendar day + fuel_volume(2dp)
// + cost(2dp)).
//
// WHY THIS IS SAFE NOW
// The driver backfill has been applied, so every duplicate group now has
// the same driver_id (and station_id if resolved). Removing duplicates
// will not lose any attribution data – we keep one representative row
// per event.
//
// KEEP STRATEGY
// For each group of duplicates, the script keeps the document with the
// SMALLEST _id (oldest insertion order) and deletes the others. You can
// change the strategy by modifying the `chooseWinner` function below.
//
// USAGE
//   Dry run (see what would be deleted – makes NO changes):
//     npx tsx scripts/remove-duplicate-fuel-logs.ts
//
//   Actually delete the duplicates:
//     npx tsx scripts/remove-duplicate-fuel-logs.ts --apply
//
//   Scope to a tenant (defaults to "default"):
//     SEED_TENANT_ID=acme npx tsx scripts/remove-duplicate-fuel-logs.ts --apply

import 'dotenv/config';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

const TENANT_ID = process.env.SEED_TENANT_ID || 'default';
const APPLY = process.argv.includes('--apply');

// ------------------------------------------------------------------
// 1. Same normalisation helpers your importer uses
// ------------------------------------------------------------------
function normalizeDedupDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}

function normalizeDedupNumber(value: unknown): string {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof n !== 'number' || Number.isNaN(n)) return String(value ?? '');
  return (Math.round(n * 100) / 100).toFixed(2);
}

function buildKey(doc: {
  license_plate?: unknown;
  date?: unknown;
  fuel_volume?: unknown;
  cost?: unknown;
}): string | null {
  const plate = typeof doc.license_plate === 'string' ? doc.license_plate.trim().toUpperCase() : '';
  if (!plate) return null;
  return [
    plate,
    normalizeDedupDate(doc.date),
    normalizeDedupNumber(doc.fuel_volume),
    normalizeDedupNumber(doc.cost),
  ].join('|');
}

// ------------------------------------------------------------------
// 2. Choose which document to keep in a duplicate group
//    (smallest _id = oldest insertion; change to suit your needs)
// ------------------------------------------------------------------
function chooseWinner(docs: { _id: ObjectId }[]): ObjectId {
  let winner = docs[0]._id;
  for (const doc of docs) {
    if (doc._id.toString() < winner.toString()) {
      winner = doc._id;
    }
  }
  return winner;
}

// ------------------------------------------------------------------
// 3. Main
// ------------------------------------------------------------------
async function run() {
  const db = await connectToDatabase();
  const collection = db.collection('tblfuellogs');

  // Pull all non-deleted fuel logs for the tenant
  const allDocs = await collection
    .find(
      { tenantId: TENANT_ID, isDeleted: { $ne: true } },
      { projection: { _id: 1, license_plate: 1, date: 1, fuel_volume: 1, cost: 1 } }
    )
    .toArray();

  // Group by dedup key
  const groups = new Map<string, { _id: ObjectId }[]>();
  for (const doc of allDocs) {
    const key = buildKey(doc);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push({ _id: doc._id });
    groups.set(key, list);
  }

  // Find duplicate groups (size > 1)
  const duplicateGroups = Array.from(groups.entries()).filter(
    ([, docs]) => docs.length > 1
  );

  const totalDuplicates = duplicateGroups.reduce((sum, [, docs]) => sum + docs.length - 1, 0);

  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Total documents scanned: ${allDocs.length}`);
  console.log(`Duplicate groups found: ${duplicateGroups.length}`);
  console.log(`Documents to delete: ${totalDuplicates}`);
  console.log(`Mode: ${APPLY ? 'DELETE (writes enabled)' : 'DRY RUN (no writes)'}\n`);

  if (duplicateGroups.length === 0) {
    console.log('No duplicates found. Nothing to do.');
    process.exit(0);
  }

  // Sample of what will be kept / deleted
  console.log('=== Sample of duplicate groups (first 10) ===');
  for (const [key, docs] of duplicateGroups.slice(0, 10)) {
    const winner = chooseWinner(docs);
    const toDelete = docs.filter(d => d._id.toString() !== winner.toString());
    console.log(`Key: ${key}`);
    console.log(`  Keep:   ${winner}`);
    console.log(`  Delete: ${toDelete.map(d => d._id).join(', ')}`);
    console.log('');
  }

  // Apply deletions if --apply
  if (APPLY) {
    let deletedCount = 0;
    for (const [, docs] of duplicateGroups) {
      const winner = chooseWinner(docs);
      const idsToDelete = docs
        .filter(d => d._id.toString() !== winner.toString())
        .map(d => d._id);
      if (idsToDelete.length > 0) {
        const result = await collection.deleteMany({ _id: { $in: idsToDelete } });
        deletedCount += result.deletedCount;
      }
    }
    console.log(`\n✅ Deleted ${deletedCount} duplicate documents.`);
  } else {
    console.log('\nDry run complete. No documents were deleted. Re-run with --apply to remove duplicates.');
  }

  process.exit(0);
}

run().catch((error) => {
  console.error('Duplicate removal failed:', error);
  process.exit(1);
});