// scripts/backfill-fuel-log-references-from-source.ts
//
// ONE-TIME DATA MIGRATION -- follow-up to
// scripts/backfill-fuel-log-references.ts.
//
// WHY THIS SECOND SCRIPT EXISTS
// Running the first backfill against the live tblfuellogs collection
// found 1940 candidate rows, but 0 matches -- because station_name and
// the raw driver text were undefined on every one of those documents.
// There was nothing in the database to match against.
//
// That data isn't lost, though: it's sitting in the ORIGINAL IMPORT
// FILE (FUEL_BREAKDOWN_26_CLEANED.xlsx -> "Import" sheet), which has
// station_name populated on 302 rows and driver populated on 1437 of
// 1439 rows. It never made it into tblfuellogs at import time (or these
// rows predate the driver/station_name columns being wired through the
// importer). Since the DB document itself carries no text, this script
// re-reads the ORIGINAL FILE, rebuilds the exact same natural key the
// importer already uses for duplicate detection --
//   license_plate + calendar day + fuel_volume(2dp) + cost(2dp)
// (see FuelController.buildFuelDedupKey in
// app/api/fuellogs/route.ts's controller) -- looks up the matching
// tblfuellogs document by that key, and only then resolves
// station_name/driver text against the real tblfuelstations/tbldrivers
// collections.
//
// This version handles the case where multiple DB rows share the same
// dedup key (duplicate imports). It resolves the station/driver once
// from the source row and applies the result to ALL matching DB rows,
// because they all represent the same fuelling event.
//
// USAGE
//   Dry run (default, makes no writes):
//     npx tsx scripts/backfill-fuel-log-references-from-source.ts --file "FUEL_BREAKDOWN_26_CLEANED.xlsx"
//
//   Apply the writes:
//     npx tsx scripts/backfill-fuel-log-references-from-source.ts --file "FUEL_BREAKDOWN_26_CLEANED.xlsx" --apply
//
//   Different sheet name (defaults to "Import"):
//     ... --sheet "Import"
//
//   Scope to a tenant (defaults to "default"):
//     SEED_TENANT_ID=acme npx tsx scripts/backfill-fuel-log-references-from-source.ts --file "..." --apply
//
// SAFETY
//   - Idempotent: only ever targets tblfuellogs documents currently
//     missing fuel_station_id and/or driver_id.
//   - Ambiguous station/driver text (matches 2+ real records) is
//     skipped and reported, never guessed.
//   - Dry run by default; nothing is written unless --apply is passed.

import 'dotenv/config';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

const TENANT_ID = process.env.SEED_TENANT_ID || 'default';
const APPLY = process.argv.includes('--apply');

function getArgValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const FILE_PATH = getArgValue('--file');
const SHEET_NAME = getArgValue('--sheet') || 'Import';

if (!FILE_PATH) {
  console.error('Usage: npx tsx scripts/backfill-fuel-log-references-from-source.ts --file <path-to-xlsx> [--sheet "Import"] [--apply]');
  process.exit(1);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// --- Same normalization the import controller uses for dedup keys ---
// (mirrors normalizeDedupDate / normalizeDedupNumber / buildFuelDedupKey
// in app/api/fuellogs/route.ts's FuelController so keys line up exactly.)

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

function buildKey(row: {
  license_plate?: unknown;
  date?: unknown;
  fuel_volume?: unknown;
  cost?: unknown;
}): string | null {
  const plate = typeof row.license_plate === 'string' ? row.license_plate.trim().toUpperCase() : '';
  if (!plate) return null;
  return [plate, normalizeDedupDate(row.date), normalizeDedupNumber(row.fuel_volume), normalizeDedupNumber(row.cost)].join('|');
}

interface Candidate {
  _id: ObjectId;
}

function buildTextIndex(
  records: Array<{ _id: ObjectId; name?: unknown; altKey?: unknown }>
): Map<string, Candidate[]> {
  const byKey = new Map<string, Candidate[]>();
  for (const r of records) {
    const keys = [norm(r.name), norm(r.altKey)].filter(Boolean);
    for (const key of keys) {
      const list = byKey.get(key) ?? [];
      // Only add this candidate if it hasn't already been added for this key
      if (!list.some((c) => String(c._id) === String(r._id))) {
        list.push({ _id: r._id });
      }
      byKey.set(key, list);
    }
  }
  return byKey;
}

function resolveOne(text: string, index: Map<string, Candidate[]>): { id: ObjectId | null; reason: 'matched' | 'no-match' | 'ambiguous' } {
  const key = norm(text);
  if (!key) return { id: null, reason: 'no-match' };

  const exact = index.get(key);
  if (exact && exact.length === 1) return { id: exact[0]._id, reason: 'matched' };
  if (exact && exact.length > 1) return { id: null, reason: 'ambiguous' };

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
  const resolvedPath = path.resolve(FILE_PATH!);
  console.log(`Reading source file: ${resolvedPath} (sheet: "${SHEET_NAME}")`);

  const workbook = XLSX.readFile(resolvedPath, { cellDates: true });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    console.error(`Sheet "${SHEET_NAME}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined });
  console.log(`Source rows read: ${sourceRows.length}`);

  const db = await connectToDatabase();
  const fuelLogs = db.collection('tblfuellogs');
  const stationsRaw = await db
    .collection('tblfuelstations')
    .find({ tenantId: TENANT_ID, isDeleted: { $ne: true } }, { projection: { name: 1, brand: 1 } })
    .toArray();
  const driversRaw = await db
    .collection('tbldrivers')
    .find({ tenantId: TENANT_ID, isDeleted: { $ne: true } }, { projection: { name: 1, driver_code: 1 } })
    .toArray();

  const stationIndex = buildTextIndex(stationsRaw.map((s) => ({ _id: s._id, name: s.name, altKey: s.brand })));
  const driverIndex = buildTextIndex(driversRaw.map((d) => ({ _id: d._id, name: d.name, altKey: d.driver_code })));

  // Pre-load every existing fuel log missing either reference, keyed by
  // the same natural key, so each source row is a single map lookup
  // rather than a query per row.
  const dbCandidates = await fuelLogs
    .find(
      {
        tenantId: TENANT_ID,
        isDeleted: { $ne: true },
        $or: [
          { fuel_station_id: { $in: [null, undefined, ''] } },
          { driver_id: { $in: [null, undefined, ''] } },
        ],
      },
      { projection: { license_plate: 1, date: 1, fuel_volume: 1, cost: 1, fuel_station_id: 1, driver_id: 1 } }
    )
    .toArray();

  const dbByKey = new Map<string, { _id: ObjectId; needsStation: boolean; needsDriver: boolean }[]>();
  for (const doc of dbCandidates) {
    const key = buildKey({
      license_plate: doc.license_plate,
      date: doc.date,
      fuel_volume: doc.fuel_volume,
      cost: doc.cost,
    });
    if (!key) continue;
    const list = dbByKey.get(key) ?? [];
    list.push({
      _id: doc._id,
      needsStation: !doc.fuel_station_id,
      needsDriver: !doc.driver_id,
    });
    dbByKey.set(key, list);
  }

  console.log(`DB rows missing fuel_station_id and/or driver_id: ${dbCandidates.length}`);
  console.log(`Mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}\n`);

  let keyNoMatch = 0;
  let stationMatched = 0;
  let stationAmbiguous = 0;
  let stationNoText = 0;
  let stationNoMatch = 0;
  let driverMatched = 0;
  let driverAmbiguous = 0;
  let driverNoText = 0;
  let driverNoMatch = 0;

  const issues: string[] = [];

  for (const row of sourceRows) {
    const key = buildKey({
      license_plate: row.license_plate,
      date: row.date,
      fuel_volume: row.fuel_volume,
      cost: row.cost,
    });
    if (!key) continue;

    const dbMatches = dbByKey.get(key);
    if (!dbMatches || dbMatches.length === 0) {
      keyNoMatch += 1;
      continue;
    }

    // ------- NEW LOGIC: resolve station/driver ONCE, then apply to ALL matching DB rows -------
    let resolvedStationId: string | null = null;
    let resolvedDriverId: string | null = null;

    // Resolve station if ANY of the matching DB rows needs it
    const anyNeedsStation = dbMatches.some((m) => m.needsStation);
    if (anyNeedsStation) {
      const text = typeof row.station_name === 'string' ? row.station_name : '';
      if (!text.trim()) {
        stationNoText += 1;
      } else {
        const result = resolveOne(text, stationIndex);
        if (result.reason === 'matched' && result.id) {
          resolvedStationId = String(result.id);
        } else if (result.reason === 'ambiguous') {
          stationAmbiguous += 1;
          issues.push(`key "${key}": station text "${text}" is ambiguous`);
        } else {
          stationNoMatch += 1;
          issues.push(`key "${key}": station text "${text}" has no registered match`);
        }
      }
    }

    // Resolve driver if ANY of the matching DB rows needs it
    const anyNeedsDriver = dbMatches.some((m) => m.needsDriver);
    if (anyNeedsDriver) {
      const text = typeof row.driver === 'string' ? row.driver : '';
      if (!text.trim()) {
        driverNoText += 1;
      } else {
        const result = resolveOne(text, driverIndex);
        if (result.reason === 'matched' && result.id) {
          resolvedDriverId = String(result.id);
        } else if (result.reason === 'ambiguous') {
          driverAmbiguous += 1;
          issues.push(`key "${key}": driver text "${text}" is ambiguous`);
        } else {
          driverNoMatch += 1;
          issues.push(`key "${key}": driver text "${text}" has no registered match`);
        }
      }
    }

    // Apply the resolved IDs to EVERY matching DB row
    for (const match of dbMatches) {
      const update: Record<string, unknown> = {};
      if (match.needsStation && resolvedStationId) {
        update.fuel_station_id = resolvedStationId;
        stationMatched += 1;
      }
      if (match.needsDriver && resolvedDriverId) {
        update.driver_id = resolvedDriverId;
        driverMatched += 1;
      }
      if (Object.keys(update).length > 0 && APPLY) {
        await fuelLogs.updateOne({ _id: match._id }, { $set: update });
      }
    }
  }

  console.log('=== Key matching (source row -> DB row) ===');
  console.log(`No DB row matched key: ${keyNoMatch}\n`);

  console.log('=== Station resolution ===');
  console.log(`Matched:             ${stationMatched}`);
  console.log(`Ambiguous (skipped): ${stationAmbiguous}`);
  console.log(`No text to match:    ${stationNoText}`);
  console.log(`No match found:      ${stationNoMatch}\n`);

  console.log('=== Driver resolution ===');
  console.log(`Matched:             ${driverMatched}`);
  console.log(`Ambiguous (skipped): ${driverAmbiguous}`);
  console.log(`No text to match:    ${driverNoText}`);
  console.log(`No match found:      ${driverNoMatch}\n`);

  if (issues.length > 0) {
    console.log('=== Sample of unresolved issues (first 30) ===');
    for (const issue of issues.slice(0, 30)) console.log(`  ${issue}`);
    console.log(`\n${issues.length} issues total.`);
  }

  if (!APPLY) {
    console.log('\nDry run complete. No documents were modified. Re-run with --apply to write changes.');
  } else {
    console.log('\nApply run complete. Matched rows have been updated in tblfuellogs.');
  }

  process.exit(0);
}

run().catch((error) => {
  console.error('Backfill-from-source migration failed:', error);
  process.exit(1);
});