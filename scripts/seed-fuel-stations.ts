// scripts/seed-fuel-stations.ts
//
// Seeds tblfuelstations with the station(s) referenced by your imported
// fuel logs. Every row in the CSV you imported has station_name "SOGO";
// "GLOW" also shows up inside the `notes` column ("Source: GLOW") on a
// number of rows, so it's included too in case those should also be
// registered stations rather than just a note.
//
// Additional stations extracted from the imported fuel log data (lists
// of station_name values you provided) have been added below.
//
// Matches the exact document shape already used in tblfuelstations
// (see the "Thuli" example document you shared).
//
// Run with:
//   npx tsx scripts/seed-fuel-stations.ts
// or add a package.json script, e.g.:
//   "seed:fuel-stations": "tsx scripts/seed-fuel-stations.ts"
//
// Idempotent: matches existing stations by case-insensitive name within
// the tenant before inserting, so re-running this is safe and won't
// create duplicates.
//
// Override the tenant / seed-user via env vars if "default" isn't right
// for your setup:
//   SEED_TENANT_ID=acme SEED_USER_ID=<userObjectId> npx tsx scripts/seed-fuel-stations.ts

import 'dotenv/config';                     // <-- loads your .env file
import connectToDatabase from '@/infrastructure/database/mongodb';

const TENANT_ID = process.env.SEED_TENANT_ID || 'default';
const SEED_USER_ID = process.env.SEED_USER_ID || 'system-seed';

interface StationSeed {
  name: string;
  brand?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  fuel_types: string[];
  is_preferred?: boolean;
  notes?: string;
}

const STATIONS: StationSeed[] = [
  {
    name: 'SOGO',
    brand: 'SOGO',
    city: 'Harare',
    country: 'Zimbabwe',
    fuel_types: ['Petrol', 'Diesel'],
    is_preferred: true,
    notes: 'Primary bulk fuel supplier. Matches station_name "SOGO" used across the fuel-log import.',
  },
  {
    name: 'GLOW',
    brand: 'GLOW',
    city: 'Harare',
    country: 'Zimbabwe',
    fuel_types: ['Petrol', 'Diesel'],
    is_preferred: false,
    notes: 'Referenced in several fuel log notes as "Source: GLOW" -- confirm this should be a registered station rather than just an internal note before relying on it.',
  },
  // --- stations extracted from the provided fuel log station_name lists ---
  {
    name: 'Willsgrove Farm Enterprises_Harare',
    brand: 'Willsgrove Farm Enterprises',
    city: 'Harare',
    country: 'Zimbabwe',
    fuel_types: ['Petrol', 'Diesel'],
    is_preferred: false,
    notes: 'Added from imported fuel log data.',
  },
  {
    name: 'Traverse',
    brand: 'Traverse',
    city: 'Harare',
    country: 'Zimbabwe',
    fuel_types: ['Petrol', 'Diesel'],
    is_preferred: false,
    notes: 'Added from imported fuel log data.',
  },
  {
    name: 'Omc1',
    brand: 'Omc1',
    city: 'Harare',
    country: 'Zimbabwe',
    fuel_types: ['Petrol', 'Diesel'],
    is_preferred: false,
    notes: 'Added from imported fuel log data.',
  },
  {
    name: 'Motion Centre',
    brand: 'Motion Centre',
    city: 'Harare',
    country: 'Zimbabwe',
    fuel_types: ['Petrol', 'Diesel'],
    is_preferred: false,
    notes: 'Added from imported fuel log data.',
  },
  {
    name: 'Cathedral',
    brand: 'Cathedral',
    city: 'Harare',
    country: 'Zimbabwe',
    fuel_types: ['Petrol', 'Diesel'],
    is_preferred: false,
    notes: 'Added from imported fuel log data.',
  },
  {
    name: 'Fountain',
    brand: 'Fountain',
    city: 'Harare',
    country: 'Zimbabwe',
    fuel_types: ['Petrol', 'Diesel'],
    is_preferred: false,
    notes: 'Added from imported fuel log data.',
  },
  {
    name: 'North East',
    brand: 'North East',
    city: 'Harare',
    country: 'Zimbabwe',
    fuel_types: ['Petrol', 'Diesel'],
    is_preferred: false,
    notes: 'Added from imported fuel log data.',
  },
];

async function seedFuelStations() {
  const db = await connectToDatabase();
  const collection = db.collection('tblfuelstations');
  const now = new Date();

  let inserted = 0;
  let skipped = 0;

  for (const station of STATIONS) {
    const existing = await collection.findOne({
      tenantId: TENANT_ID,
      isDeleted: { $ne: true },
      name: { $regex: `^${station.name}$`, $options: 'i' },
    });

    if (existing) {
      console.log(`Skip (already exists): ${station.name}`);
      skipped += 1;
      continue;
    }

    await collection.insertOne({
      name: station.name,
      brand: station.brand ?? '',
      address: station.address ?? '',
      city: station.city ?? '',
      country: station.country ?? '',
      phone: station.phone ?? '',
      fuel_types: station.fuel_types,
      is_preferred: station.is_preferred ?? false,
      status: 'active',
      notes: station.notes ?? '',
      tenantId: TENANT_ID,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      deletedAt: null,
      createdBy: SEED_USER_ID,
      updatedBy: SEED_USER_ID,
    });

    console.log(`Inserted: ${station.name}`);
    inserted += 1;
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (already existed).`);
  process.exit(0);
}

seedFuelStations().catch((error) => {
  console.error('Fuel station seeding failed:', error);
  process.exit(1);
});