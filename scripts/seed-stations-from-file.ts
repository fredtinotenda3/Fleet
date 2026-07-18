// scripts/seed-stations-from-file.ts
//
// Reads the cleaned fuel import workbook (Fuel_Import_Workbook.xlsx,
// sheet "Fuel Import Data"), extracts distinct station_name values,
// and inserts any missing ones into tblfuelstations.
//
// USAGE:
//   npx tsx scripts/seed-stations-from-file.ts --file "C:\Users\Accounts\Downloads\Fuel_Import_Workbook.xlsx"
//
//   (Optional) --sheet "Fuel Import Data" (default)
//   (Optional) --apply  (without --apply it's a dry run)

import 'dotenv/config';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { MongoClient, ObjectId } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'VehicleExpense';
const TENANT_ID = process.env.SEED_TENANT_ID || 'default';
const APPLY = process.argv.includes('--apply');

function getArgValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const FILE_PATH = getArgValue('--file') || path.resolve('Fuel_Import_Workbook.xlsx');
const SHEET_NAME = getArgValue('--sheet') || 'Fuel Import Data';

async function run() {
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI not set.');
    process.exit(1);
  }

  console.log(`Reading file: ${FILE_PATH} (sheet: "${SHEET_NAME}")`);
  const wb = XLSX.readFile(FILE_PATH, { cellDates: true });
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) {
    console.error(`Sheet "${SHEET_NAME}" not found. Available: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined });
  const stationNames = new Set<string>();

  for (const row of rows) {
    const name = row.station_name;
    if (typeof name === 'string' && name.trim().length > 0) {
      stationNames.add(name.trim());
    }
  }

  const namesArray = Array.from(stationNames).sort();
  console.log(`Distinct station names in file: ${namesArray.length}`);
  console.log(namesArray);

  if (namesArray.length === 0) {
    console.log('No station names found. Exiting.');
    process.exit(0);
  }

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection('tblfuelstations');

  // Find which names already exist (normalized lowercase)
  const existing = await collection
    .find({ tenantId: TENANT_ID, isDeleted: { $ne: true } })
    .project({ name: 1, brand: 1 })
    .toArray();

  const existingLowerNames = new Set(
    existing.flatMap(s => [s.name?.trim().toLowerCase(), s.brand?.trim().toLowerCase()]).filter(Boolean)
  );

  const missing = namesArray.filter(name => !existingLowerNames.has(name.toLowerCase()));

  console.log(`Already exist: ${namesArray.length - missing.length}`);
  console.log(`Missing to add: ${missing.length}`);

  if (missing.length > 0) {
    const docs = missing.map(name => ({
      tenantId: TENANT_ID,
      name,
      brand: name, // using name as brand as well
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (APPLY) {
      const result = await collection.insertMany(docs);
      console.log(`✅ Inserted ${result.insertedCount} stations.`);
    } else {
      console.log('Dry run: would insert', docs.length, 'stations. Re-run with --apply to commit.');
    }
  }

  await client.close();
  process.exit(0);
}

run().catch((error) => {
  console.error('Seed stations failed:', error);
  process.exit(1);
});