// scripts/backfill-fuel-type-normalization.ts
//
// WHY THIS IS NEEDED
// ---------------------------------------------------------------------
// PART 1 fix ("Fuel Type Distribution" showing Diesel(91.6%)/diesel(3.3%)
// and Petrol(4.9%)/petrol(0.3%) as four slices instead of two).
// modules/fuel/commands/handlers/create-fuel-log.handler.ts and
// update-fuel-log.handler.ts now canonicalize fuel_type at write time
// (via modules/fuel/utils/fuel-type.utils.ts's normalizeFuelType), and
// FuelRepository.getFuelTypeDistribution now defensively re-groups by
// canonical key even for un-normalized data -- so the chart is already
// correct for every tenant, including one that never runs this script.
//
// This script exists for a second, separate reason: to give EXISTING
// fuel logs the same fuel_type_raw provenance field new ones get, so
// "what was actually typed/imported" survives for every historical row,
// not just future ones -- see shared/types/fuel.types.ts's FuelLog doc
// comments on fuel_type/fuel_type_raw ("Do not destroy original source
// values where the platform is designed to preserve them").
//
// WHAT THIS SCRIPT DOES
// ---------------------------------------------------------------------
// For one tenant, finds every non-deleted tblfuellogs document that has
// a fuel_type but NO fuel_type_raw yet (i.e. every row written before
// this fix), and:
//   - sets fuel_type_raw = the value fuel_type ALREADY holds (exactly as
//     it was originally stored -- nothing is re-typed or guessed)
//   - sets fuel_type = normalizeFuelType(that same value).normalized
//     (a no-op for a row that was already "Diesel"/"Petrol" etc; a real
//     change for "diesel"/"DIESEL"/" Diesel" and similar)
//
// SAFE TO RE-RUN. The selection filter (`fuel_type_raw` absent) means a
// row is only ever processed once -- fuel_type_raw is never touched
// again after this script (or the write-time fix) sets it, so re-running
// finds nothing left to do and is a no-op.
//
// WHAT THIS SCRIPT DOES NOT DO
// ---------------------------------------------------------------------
//   * It never changes fuel_volume, cost, driver_id, license_plate, or
//     any other field -- this touches exactly two fields
//     (fuel_type / fuel_type_raw) on exactly the rows that need them.
//   * It never deletes anything.
//   * It never invents a fuel_type for a row that has none -- a log with
//     no fuel_type set is left exactly as it is (`fuel_type: undefined`
//     stays undefined; normalizeFuelType('') returns
//     `{ normalized: null }`, which this script treats as "nothing to
//     do" for that row).
//
// AUDIT. One summary record per run is written to
// tbltenant_repair_audit (the same collection reset-business-data.ts and
// tenant-data-repair.ts both use) -- a single aggregate record, not one
// per document: unlike tenant-data-repair.ts's ownership repairs (where
// each row's resolved owner is a distinct judgment call worth its own
// audit line), every write this script makes is the exact same
// deterministic function applied to a different input, so one run-level
// summary (tenant, count changed, count already-canonical, a sample of
// raw->normalized mappings) is the right level of detail -- consistent
// with reset-business-data.ts's own aggregate audit shape.
//
// Usage:
//   npx tsx scripts/backfill-fuel-type-normalization.ts --tenant <slug>              # dry run
//   npx tsx scripts/backfill-fuel-type-normalization.ts --tenant <slug> --confirm    # apply

import 'dotenv/config';
import { MongoClient, Db } from 'mongodb';
import { buildTenantIdentityIndex, resolveCanonical } from './lib/tenant-identity';
import { normalizeFuelType } from '../modules/fuel/utils/fuel-type.utils';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const tenantArg = argValue('tenant');
  const confirm = hasFlag('confirm');

  if (!tenantArg) {
    console.error('--tenant <slug> is required. Tenant is never inferred or defaulted.');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db: Db = client.db();

  const index = await buildTenantIdentityIndex(db);
  const tenantId = resolveCanonical(index, tenantArg);
  if (!tenantId) {
    console.error(`"${tenantArg}" does not resolve to a real organization. Check spelling -- tenant is never guessed.`);
    await client.close();
    process.exit(1);
  }

  const collection = db.collection('tblfuellogs');
  const candidates = await collection
    .find({
      tenantId,
      isDeleted: { $ne: true },
      fuel_type: { $exists: true, $nin: [null, ''] },
      fuel_type_raw: { $exists: false },
    })
    .toArray();

  console.log('');
  console.log(`${BOLD}Fuel-type normalization backfill -- ${tenantId}${RESET}`);
  console.log(`${DIM}${candidates.length} fuel log(s) have a fuel_type but no fuel_type_raw yet${RESET}`);
  console.log(`${DIM}${'='.repeat(88)}${RESET}`);

  if (candidates.length === 0) {
    console.log(`${GREEN}Nothing to do.${RESET} Every fuel log in scope already carries fuel_type_raw.`);
    await client.close();
    return;
  }

  let willChangeCasing = 0;
  let alreadyCanonical = 0;
  const sampleChanges = new Map<string, string>(); // "diesel" -> "Diesel"

  for (const doc of candidates) {
    const original = String(doc.fuel_type);
    const { normalized } = normalizeFuelType(original);
    if (normalized && normalized !== original) {
      willChangeCasing += 1;
      if (sampleChanges.size < 15) sampleChanges.set(original, normalized);
    } else {
      alreadyCanonical += 1;
    }
  }

  console.log(`  will change casing (e.g. "diesel" -> "Diesel"): ${willChangeCasing}`);
  console.log(`  already canonical (only gains fuel_type_raw, no visible change): ${alreadyCanonical}`);
  if (sampleChanges.size > 0) {
    console.log('');
    console.log(`  sample mappings:`);
    for (const [from, to] of sampleChanges) {
      console.log(`    "${from}" -> "${to}"`);
    }
  }

  if (!confirm) {
    console.log('');
    console.log(`${YELLOW}DRY RUN${RESET} -- no writes made. Re-run with ${BOLD}--confirm${RESET} to apply.`);
    await client.close();
    return;
  }

  let written = 0;
  for (const doc of candidates) {
    const original = String(doc.fuel_type);
    const { normalized } = normalizeFuelType(original);
    if (!normalized) continue; // defensive; original was already checked non-empty above
    await collection.updateOne(
      { _id: doc._id },
      { $set: { fuel_type: normalized, fuel_type_raw: original, updatedAt: new Date() } }
    );
    written += 1;
  }

  await db.collection('tbltenant_repair_audit').insertOne({
    at: new Date(),
    actor: 'scripts/backfill-fuel-type-normalization.ts',
    action: 'FUEL_TYPE_NORMALIZATION_BACKFILL',
    tenantId,
    documentsUpdated: written,
    sampleMappings: Array.from(sampleChanges.entries()).map(([from, to]) => ({ from, to })),
  });

  console.log('');
  console.log(`${GREEN}Done.${RESET} ${written} fuel log(s) updated. Audit record written to tbltenant_repair_audit.`);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
