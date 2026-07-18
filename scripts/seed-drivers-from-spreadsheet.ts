// scripts/seed-drivers-from-spreadsheet.ts
//
// Reads the "Import" sheet of FUEL_BREAKDOWN_26_CLEANED.xlsx,
// extracts every unique value from the "driver" column,
// and inserts them into tbldrivers as new driver documents.
// Each driver gets:
//   - name           = the driver text from the spreadsheet
//   - driver_code    = the same text (since we have no other ID, but it ensures
//                       uniqueness – each name appears only once in the collection)
//   - tenantId       = "default"
//   - isDeleted      = false
//
// After this seed, the backfill script will match every driver unambiguously.

import 'dotenv/config';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { MongoClient } from 'mongodb';

const TENANT_ID = process.env.SEED_TENANT_ID || 'default';
const MONGO_URI = process.env.MONGODB_URI;
const FILE_PATH = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : path.resolve('FUEL_BREAKDOWN_26_CLEANED.xlsx');
const SHEET_NAME = process.argv.includes('--sheet')
  ? process.argv[process.argv.indexOf('--sheet') + 1]
  : 'Import';

async function run() {
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI not found in environment.');
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
  const driverNames = new Set<string>();

  for (const row of rows) {
    const driver = row.driver;
    if (typeof driver === 'string' && driver.trim()) {
      driverNames.add(driver.trim());
    }
  }

  const driversArray = Array.from(driverNames).sort();
  console.log(`Unique drivers found: ${driversArray.length}`);
  console.log(driversArray);

  if (driversArray.length === 0) {
    console.log('No driver names found. Exiting.');
    process.exit(0);
  }

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log('✅ Connected to MongoDB');

  const db = client.db('VehicleExpense');
  const collection = db.collection('tbldrivers');

  // Delete any leftover drivers (clean start)
  await collection.deleteMany({ tenantId: TENANT_ID });

  const docs = driversArray.map((name) => ({
    tenantId: TENANT_ID,
    name,
    driver_code: name,   // we use the name as code so it matches backfill index
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const result = await collection.insertMany(docs);
  console.log(`✅ Inserted ${result.insertedCount} drivers into tbldrivers`);

  await client.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});