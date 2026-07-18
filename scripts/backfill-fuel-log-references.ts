// scripts/backfill-fuel-log-references.ts
//
// ONE-TIME DATA MIGRATION -- not an application code fix.
//
// Root cause (confirmed via scripts/check-legacy-rows.ts): a batch of
// historical tblfuellogs documents predate fuel_station_id/driver_id
// being populated at write time. On those rows, fuel_station_id,
// driver_id, AND station_name are all undefined -- there is no
// attribution data on the document at all. The enterprise analytics
// aggregations (FuelRepository.getFuelByStation / getFuelByDriver) are
// already correct: they resolve real names whenever an ID or a
// station_name/driver string exists, and only fall back to
// "Unregistered station" / "Unassigned" when nothing does. No
// aggregation change can invent a relationship that was never stored.
//
// This script is the actual fix: it walks every fuel log missing
// fuel_station_id and/or driver_id, and tries to resolve a real
// reference from whatever free-text is still on the document (or in a
// legacy import field), matching against the REAL tblfuelstations /
// tbldrivers collections (source of truth). Rows with genuinely no
// text to match against are left alone and reported for manual review
// -- this script never guesses.
//
// USAGE
//   Dry run (default, makes no writes):
//     npx tsx scripts/backfill-fuel-log-references.ts
//
//   Apply the writes:
//     npx tsx scripts/backfill-fuel-log-references.ts --apply
//
//   Scope to a tenant (defaults to "default", matching the other seed
//   scripts in this repo):
//     SEED_TENANT_ID=acme npx tsx scripts/backfill-fuel-log-references.ts --apply
//
//   Also attempt to match a legacy raw-import text field for driver
//   (only needed if your original CSV import stored the driver's raw
//   text somewhere other than driver_id -- adjust LEGACY_DRIVER_TEXT_FIELD
//   below if your schema differs; defaults to a field named
//   "driver_import_text" and silently no-ops if that field isn't present
//   on any document):
//     LEGACY_DRIVER_TEXT_FIELD=notes npx tsx scripts/backfill-fuel-log-references.ts --apply
//
// SAFETY
//   - Idempotent: only ever targets documents missing fuel_station_id
//     and/or driver_id; already-resolved rows are never touched.
//   - Ambiguous matches (2+ candidates for the same text) are SKIPPED
//     and reported, never guessed.
//   - Dry run by default. Nothing is written unless --apply is passed.
//   - Produces a full audit log (matched / ambiguous / unmatched) so
//     you can review before and after applying.

import 'dotenv/config';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

const TENANT_ID = process.env.SEED_TENANT_ID || 'default';
const LEGACY_DRIVER_TEXT_FIELD = process.env.LEGACY_DRIVER_TEXT_FIELD || 'driver_import_text';
const APPLY = process.argv.includes('--apply');

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

interface StationCandidate {
  _id: ObjectId;
  keys: string[]; // lowercased name + brand
}

interface DriverCandidate {
  _id: ObjectId;
  keys: string[]; // lowercased name + driver_code
}

async function buildStationIndex(db: Awaited<ReturnType<typeof connectToDatabase>>) {
  const stations = await db
    .collection('tblfuelstations')
    .find({ tenantId: TENANT_ID, isDeleted: { $ne: true } }, { projection: { name: 1, brand: 1 } })
    .toArray();

  const byKey = new Map<string, StationCandidate[]>();
  for (const s of stations) {
    const keys = [norm(s.name), norm(s.brand)].filter(Boolean);
    for (const key of keys) {
      const list = byKey.get(key) ?? [];
      list.push({ _id: s._id, keys });
      byKey.set(key, list);
    }
  }
  return byKey;
}

async function buildDriverIndex(db: Awaited<ReturnType<typeof connectToDatabase>>) {
  const drivers = await db
    .collection('tbldrivers')
    .find({ tenantId: TENANT_ID, isDeleted: { $ne: true } }, { projection: { name: 1, driver_code: 1 } })
    .toArray();

  const byKey = new Map<string, DriverCandidate[]>();
  for (const d of drivers) {
    const keys = [norm(d.name), norm(d.driver_code)].filter(Boolean);
    for (const key of keys) {
      const list = byKey.get(key) ?? [];
      list.push({ _id: d._id, keys });
      byKey.set(key, list);
    }
  }
  return byKey;
}

/** Resolves a free-text value to exactly one candidate id, or null if zero/ambiguous. */
function resolveOne<T extends { _id: ObjectId }>(
  text: string,
  index: Map<string, T[]>
): { id: ObjectId | null; reason: 'matched' | 'no-match' | 'ambiguous' } {
  const key = norm(text);
  if (!key) return { id: null, reason: 'no-match' };

  const exact = index.get(key);
  if (exact && exact.length === 1) return { id: exact[0]._id, reason: 'matched' };
  if (exact && exact.length > 1) return { id: null, reason: 'ambiguous' };

  // Fall back to a case-insensitive exact regex match across all keys,
  // in case of trailing punctuation/whitespace variants not caught by
  // simple normalization.
  const pattern = new RegExp(`^${escapeRegex(key)}$`, 'i');
  const hits = new Set<string>();
  for (const [k, candidates] of index.entries()) {
    if (pattern.test(k)) {
      for (const c of candidates) hits.add(String(c._id));
    }
  }
  if (hits.size === 1) return { id: new ObjectId(Array.from(hits)[0]), reason: 'matched' };
  if (hits.size > 1) return { id: null, reason: 'ambiguous' };
  return { id: null, reason: 'no-match' };
}

async function run() {
  const db = await connectToDatabase();
  const fuelLogs = db.collection('tblfuellogs');

  const [stationIndex, driverIndex] = await Promise.all([buildStationIndex(db), buildDriverIndex(db)]);

  const candidateRows = await fuelLogs
    .find(
      {
        tenantId: TENANT_ID,
        isDeleted: { $ne: true },
        $or: [
          { fuel_station_id: { $in: [null, undefined, ''] } },
          { driver_id: { $in: [null, undefined, ''] } },
        ],
      },
      {
        projection: {
          license_plate: 1,
          date: 1,
          station_name: 1,
          fuel_station_id: 1,
          driver_id: 1,
          [LEGACY_DRIVER_TEXT_FIELD]: 1,
        },
      }
    )
    .toArray();

  console.log(`Mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}`);
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Legacy driver text field checked: "${LEGACY_DRIVER_TEXT_FIELD}"`);
  console.log(`Candidate rows missing fuel_station_id and/or driver_id: ${candidateRows.length}\n`);

  let stationMatched = 0;
  let stationAmbiguous = 0;
  let stationNoText = 0;
  let stationNoMatch = 0;

  let driverMatched = 0;
  let driverAmbiguous = 0;
  let driverNoText = 0;
  let driverNoMatch = 0;

  const unresolvedSample: Array<{ _id: string; issue: string }> = [];

  for (const row of candidateRows) {
    const update: Record<string, unknown> = {};

    const needsStation = !row.fuel_station_id;
    const needsDriver = !row.driver_id;

    if (needsStation) {
      const text = typeof row.station_name === 'string' ? row.station_name : '';
      if (!text.trim()) {
        stationNoText += 1;
      } else {
        const result = resolveOne(text, stationIndex);
        if (result.reason === 'matched' && result.id) {
          update.fuel_station_id = String(result.id);
          stationMatched += 1;
        } else if (result.reason === 'ambiguous') {
          stationAmbiguous += 1;
          unresolvedSample.push({ _id: String(row._id), issue: `station text "${text}" is ambiguous` });
        } else {
          stationNoMatch += 1;
          unresolvedSample.push({ _id: String(row._id), issue: `station text "${text}" has no match` });
        }
      }
    }

    if (needsDriver) {
      const legacyText = (row as Record<string, unknown>)[LEGACY_DRIVER_TEXT_FIELD];
      const text = typeof legacyText === 'string' ? legacyText : '';
      if (!text.trim()) {
        driverNoText += 1;
      } else {
        const result = resolveOne(text, driverIndex);
        if (result.reason === 'matched' && result.id) {
          update.driver_id = String(result.id);
          driverMatched += 1;
        } else if (result.reason === 'ambiguous') {
          driverAmbiguous += 1;
          unresolvedSample.push({ _id: String(row._id), issue: `driver text "${text}" is ambiguous` });
        } else {
          driverNoMatch += 1;
          unresolvedSample.push({ _id: String(row._id), issue: `driver text "${text}" has no match` });
        }
      }
    }

    if (Object.keys(update).length > 0 && APPLY) {
      await fuelLogs.updateOne({ _id: row._id }, { $set: update });
    }
  }

  console.log('=== Station resolution ===');
  console.log(`Matched:            ${stationMatched}`);
  console.log(`Ambiguous (skipped): ${stationAmbiguous}`);
  console.log(`No text to match:   ${stationNoText}`);
  console.log(`No match found:     ${stationNoMatch}\n`);

  console.log('=== Driver resolution ===');
  console.log(`Matched:            ${driverMatched}`);
  console.log(`Ambiguous (skipped): ${driverAmbiguous}`);
  console.log(`No text to match:   ${driverNoText}`);
  console.log(`No match found:     ${driverNoMatch}\n`);

  if (unresolvedSample.length > 0) {
    console.log('=== Sample of unresolved rows (first 25) ===');
    for (const item of unresolvedSample.slice(0, 25)) {
      console.log(`  ${item._id}: ${item.issue}`);
    }
    console.log(
      `\n${unresolvedSample.length} row-level issues total. These rows genuinely have no ` +
        `resolvable station/driver text and will continue to show "Unregistered station" / ` +
        `"Unassigned" until corrected manually (or the source data is re-checked for a raw ` +
        `import field this script wasn't told about).`
    );
  }

  if (!APPLY) {
    console.log('\nDry run complete. No documents were modified. Re-run with --apply to write changes.');
  } else {
    console.log('\nApply run complete. Matched rows have been updated in tblfuellogs.');
  }

  process.exit(0);
}

run().catch((error) => {
  console.error('Backfill migration failed:', error);
  process.exit(1);
});