// scripts/seed-fuellogs.ts
//
// Reads the cleaned fuel import Excel file and inserts only
// NEW rows into tblfuellogs, skipping duplicates already present
// in the database (or within the file itself).
//
// SAFETY
//  - Dry-run by default – no writes. Use --apply to actually insert.
//  - Resolves driver_id and fuel_station_id from the file text using
//    the same logic as the live import controller.
//  - Skips rows that match an existing DB record on
//    license_plate + date (calendar day) + fuel_volume (2dp) + cost (2dp)
//  - Also skips rows that are duplicates within the file itself.
//
// USAGE
//   Dry run:
//     npx tsx scripts/seed-fuellogs.ts --file "C:\Users\Accounts\Downloads\FUEL_BREAKDOWN_26_CLEANED.xlsx"
//
//   Apply:
//     npx tsx scripts/seed-fuellogs.ts --file "C:\Users\Accounts\Downloads\FUEL_BREAKDOWN_26_CLEANED.xlsx" --apply
//
//   Different sheet (default: "Fuel Import Data"):
//     ... --sheet "YourSheetName"

import 'dotenv/config';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'VehicleExpense';
const TENANT_ID = process.env.SEED_TENANT_ID || 'default';

const APPLY = process.argv.includes('--apply');
const FILE_ARG = process.argv.includes('--file') ? process.argv[process.argv.indexOf('--file') + 1] : null;
const SHEET_NAME = process.argv.includes('--sheet') ? process.argv[process.argv.indexOf('--sheet') + 1] : 'Fuel Import Data';

if (!MONGO_URI || !FILE_ARG) {
  console.error('Usage: npx tsx scripts/seed-fuellogs.ts --file <path-to-xlsx> [--sheet "Fuel Import Data"] [--apply]');
  process.exit(1);
}

// ------------------------------------------------------------------
// Normalisation helpers (same as import controller)
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

function buildDedupKey(row: {
  license_plate?: unknown;
  date?: unknown;
  fuel_volume?: unknown;
  cost?: unknown;
}): string | null {
  const plate = typeof row.license_plate === 'string' ? row.license_plate.trim().toUpperCase() : '';
  if (!plate) return null;
  return [
    plate,
    normalizeDedupDate(row.date),
    normalizeDedupNumber(row.fuel_volume),
    normalizeDedupNumber(row.cost),
  ].join('|');
}

// ------------------------------------------------------------------
// Driver & Station resolvers (same as import controller)
// ------------------------------------------------------------------
async function buildDriverLookup(db: ReturnType<typeof getDb>) {
  const drivers = await db
    .collection('tbldrivers')
    .find({ tenantId: TENANT_ID, isDeleted: { $ne: true } })
    .toArray();

  const byKey = new Map<string, string>(); // normalized name/code -> id
  const ambiguous = new Set<string>();

  for (const d of drivers) {
    const id = String(d._id);
    const keys: string[] = [];
    if (d.name) keys.push(String(d.name).trim().toLowerCase());
    if ((d as any).driver_code) keys.push(String((d as any).driver_code).trim().toLowerCase());

    for (const key of keys) {
      if (byKey.has(key) && byKey.get(key) !== id) {
        ambiguous.add(key);
      } else {
        byKey.set(key, id);
      }
    }
  }

  return { byKey, ambiguous };
}

async function buildStationLookup(db: ReturnType<typeof getDb>) {
  const stations = await db
    .collection('tblfuelstations')
    .find({ tenantId: TENANT_ID, isDeleted: { $ne: true } })
    .toArray();

  const map = new Map<string, string>();
  for (const s of stations) {
    const id = String(s._id);
    if (s.name) map.set(String(s.name).trim().toLowerCase(), id);
    if (s.brand) map.set(String(s.brand).trim().toLowerCase(), id);
  }
  return map;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function run() {
  const filePath = path.resolve(FILE_ARG!);
  console.log(`Reading file: ${filePath} (sheet: "${SHEET_NAME}")`);
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    console.error(`Sheet "${SHEET_NAME}" not found. Available: ${workbook.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined });
  console.log(`Rows read from sheet: ${rows.length}`);

  // Connect to DB
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const fuelLogs = db.collection('tblfuellogs');

  // Build driver and station lookups
  const [driverLookup, stationLookup] = await Promise.all([
    buildDriverLookup(db),
    buildStationLookup(db),
  ]);

  // Build set of existing dedup keys (only for relevant plates and date range)
  const distinctPlates = Array.from(
    new Set(
      rows
        .map((r) => (typeof r.license_plate === 'string' ? r.license_plate.trim().toUpperCase() : ''))
        .filter(Boolean)
    )
  );

  let dateRange: { min: Date; max: Date } | null = null;
  for (const r of rows) {
    if (!r.date) continue;
    const d = new Date(r.date as string | number);
    if (Number.isNaN(d.getTime())) continue;
    if (!dateRange) dateRange = { min: d, max: d };
    else {
      if (d < dateRange.min) dateRange.min = d;
      if (d > dateRange.max) dateRange.max = d;
    }
  }

  const existingKeys = new Set<string>();
  if (distinctPlates.length > 0) {
    const match: Record<string, unknown> = {
      tenantId: TENANT_ID,
      isDeleted: { $ne: true },
      license_plate: { $in: distinctPlates },
    };
    if (dateRange) {
      // Slight buffer around the range to be safe
      const bufferedMin = new Date(dateRange.min.getTime() - 24 * 60 * 60 * 1000);
      const bufferedMax = new Date(dateRange.max.getTime() + 24 * 60 * 60 * 1000);
      match.date = { $gte: bufferedMin, $lte: bufferedMax };
    }
    const existingDocs = await fuelLogs.find(match, {
      projection: { license_plate: 1, date: 1, fuel_volume: 1, cost: 1 },
    }).toArray();

    for (const doc of existingDocs) {
      const key = buildDedupKey(doc);
      if (key) existingKeys.add(key);
    }
    console.log(`Existing dedup keys in DB: ${existingKeys.size}`);
  }

  // Track keys seen within this batch to avoid internal duplicates
  const seenInBatch = new Set<string>();

  // Counters
  let inserted = 0;
  let skippedExisting = 0;
  let skippedDuplicate = 0;
  let driverAmbiguous = 0;
  let driverNotFound = 0;
  let stationResolved = 0;

  for (const row of rows) {
    // Required fields
    if (!row.license_plate || !row.date || row.fuel_volume == null || row.cost == null) {
      console.warn(`Skipping row with missing required fields: ${JSON.stringify(row)}`);
      continue;
    }

    const key = buildDedupKey(row);
    if (!key) continue;

    // Skip if key already exists in DB or earlier in this batch
    if (existingKeys.has(key)) {
      skippedExisting++;
      continue;
    }
    if (seenInBatch.has(key)) {
      skippedDuplicate++;
      continue;
    }

    // Resolve driver
    let driverId: string | undefined = undefined;
    const driverCell = row.driver;
    if (typeof driverCell === 'string' && driverCell.trim().length > 0) {
      const trimmed = driverCell.trim();
      const lowered = trimmed.toLowerCase();

      // If it's a valid ObjectId and in our lookup, use it
      if (driverLookup.ambiguous.has(lowered)) {
        driverAmbiguous++;
        console.warn(`Ambiguous driver "${trimmed}" – skipping row.`);
        continue;
      }
      const matchId = driverLookup.byKey.get(lowered);
      if (!matchId) {
        driverNotFound++;
        console.warn(`Driver "${trimmed}" not found – skipping row.`);
        continue;
      }
      driverId = matchId;
    }

    // Resolve station
    let stationId: string | undefined = undefined;
    const stationCell = row.station_name;
    if (!row.fuel_station_id && typeof stationCell === 'string' && stationCell.trim().length > 0) {
      const stationIdMatch = stationLookup.get(stationCell.trim().toLowerCase());
      if (stationIdMatch) {
        stationId = stationIdMatch;
        stationResolved++;
      }
    }

    // Prepare the document to insert
    const doc: Record<string, unknown> = {
      tenantId: TENANT_ID,
      license_plate: String(row.license_plate).toUpperCase(),
      date: new Date(row.date as string | number),
      fuel_volume: Number(row.fuel_volume),
      cost: Number(row.cost),
      fuel_type: row.fuel_type || undefined,
      payment_method: row.payment_method || undefined,
      unit_id: row.unit_id || row.license_plate, // default unit to license plate if missing
      is_full_tank: row.is_full_tank === 'true' || row.is_full_tank === true ? true : false,
      receipt_url: row.receipt_url || undefined,
      fuel_card_id: row.fuel_card_id || undefined,
      odometer: row.odometer ? Number(row.odometer) : undefined,
      notes: row.notes || undefined,
      createdBy: 'seed-script',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (driverId) doc.driver_id = driverId;
    if (stationId) doc.fuel_station_id = stationId;
    // Remove undefined driver/station fields if not set (keep doc clean)
    if (!row.driver) delete doc.driver;

    if (APPLY) {
      await fuelLogs.insertOne(doc);
    }
    inserted++;
    seenInBatch.add(key);
  }

  console.log('\n=== Results ===');
  console.log(`New rows inserted:     ${inserted}`);
  console.log(`Skipped (existing DB): ${skippedExisting}`);
  console.log(`Skipped (duplicate in file): ${skippedDuplicate}`);
  console.log(`Driver ambiguous:      ${driverAmbiguous}`);
  console.log(`Driver not found:      ${driverNotFound}`);
  console.log(`Station matches:       ${stationResolved}`);

  if (!APPLY) {
    console.log('\nDry run complete. No changes made. Re-run with --apply to insert.');
  } else {
    console.log('\nInsertion complete.');
  }

  await client.close();
  process.exit(0);
}

run().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});