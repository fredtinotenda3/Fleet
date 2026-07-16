// scripts/seed-drivers.ts
//
// tbldrivers is currently empty, which is why every `driver` cell in
// your fuel-log import silently failed to resolve (FuelController.
// importFuelLogs looks each one up via driverRepository.findByNameOrCode
// and just omits driver_id when nothing matches -- it doesn't fail the
// row, so this was easy to miss).
//
// This seeds tbldrivers with the distinct driver names found in the
// `driver` column of the CSV you imported.
//
// IMPORTANT -- data quality, read before running:
// The source data has inconsistent spelling for what are probably the
// same people, e.g.:
//   - "VINICENT" vs "VINCENT"
//   - "TROTE" vs "TROTE HAULAGE"
//   - "FANUEL" vs "FUNUEL" (likely a typo)
//   - "TAWANDA BYO" vs "TAWANDA-BYO"
//   - "MELUSI" vs "MELUSI-BYO"
//   - "MUNYA" vs "MUNYA-BYO"
//   - "MR CHIMANYA" vs "CHIMANYA"
//   - "DONTREK-VINCENT" / "DONTREK-VINICENT" (possible typos)
// This script seeds each DISTINCT STRING as its own driver record --
// it does not try to guess which ones are the same person. Review the
// list below, delete/merge duplicates you recognise, and re-run before
// going live. Re-running is safe either way: existing names (matched
// case-insensitively) are skipped, not duplicated.
//
// Run with:
//   npx tsx scripts/seed-drivers.ts
// or add a package.json script, e.g.:
//   "seed:drivers": "tsx scripts/seed-drivers.ts"
//
// Override the tenant / seed-user via env vars if "default" isn't right
// for your setup:
//   SEED_TENANT_ID=acme SEED_USER_ID=<userObjectId> npx tsx scripts/seed-drivers.ts

import 'dotenv/config';                     // <-- loads your .env file
import connectToDatabase from '@/infrastructure/database/mongodb';

const TENANT_ID = process.env.SEED_TENANT_ID || 'default';
const SEED_USER_ID = process.env.SEED_USER_ID || 'system-seed';

// Distinct values pulled from the `driver` column of the imported CSV,
// deduplicated and normalised to uppercase.
// The list below has been supplemented with every unique driver name
// found in the full fuel log dataset.
const DRIVER_NAMES: string[] = [
  // --- original seed set ---
  'FUNNY',
  'SADMARK',
  'MR TORONGA',
  'MR NYAKUTUMBA',
  'LAWRENCE',
  'JIMMY',
  'ANELKA',
  'SAMSON',
  'MAKUNDA',
  'MR NHIRA',
  'SPENCER',
  'MARTIN',
  'KNOXFIELD',
  'VINICENT',
  'VINCENT',
  'FARAI',
  'TROTE HAULAGE',
  'TROTE',
  'NOAH',
  'TAPIWA',
  'MARY',
  'MOVADO',
  'MR CHIMANYA',
  'CHIMANYA',
  'TONDERAI',
  'DZOMA',
  'TAWANDA',
  'TAWANDA BYO',
  'TAWANDA-BYO',
  'MELUSI',
  'MELUSI-BYO',
  'TSIKIRAI',
  'CLIVE',
  'MUKWIDZA',
  'ASHTON',
  'BEYOND',
  'BEYOND TIME',
  'FANUEL',
  'FUNUEL',
  'ENTERPRISES',
  'KAHARO-HIRE',
  'ZVOUSHE',
  'HOSANA',
  'LABLE MARK',
  'STEELFORCE',
  'KATSANDE HIRE',
  'MR MANDIVENGEREI',
  'MR MANDI',
  'MUNYA-BYO',
  'MUNYA',
  'DONGO',
  'PASTOR',
  'FAITH',
  'TAKU',
  'RODDY',
  'IRVINE',
  'ZHOU',
  'DEL',
  'TONDE',
  'OZZY',

  // --- additional names from the complete dataset (merged & deduplicated) ---
  'DONTREK-VINCENT',
  'DONTREK-VINICENT',
  'DONTREK-FARAI',
  'ZVOUSHE TRANS',
  'UPWARD-FORWARD',
  'JEPHTA',
  'TAWA-BYO',
  'KAharo-Hire',          // already present as KAHARO-HIRE, but note case variation
  'MARRY',
  'OSCAR',
  'NYAKUTUMBA',           // already MR NYAKUTUMBA; distinct? appears as standalone too
  'FANUEL',               // already present
  'MUNYA',                // already present
  'MELUSI',               // already present
  'KUDZAI',
  'TROTT',
  'MUKWIDZA',             // already present
  'STEELFORCE',           // already present
  'KATSANDE HIRE',        // already present
  'LABLE MARK',           // already present
  'TAWANDA',              // already present
  'TORONGA',              // variant of MR TORONGA? keeping both
  'MR NYAKUTUMBA',        // already present
  'MR TORONGA',           // already present
  'BEYOND',               // already present
  'BEYOND TIME',          // already present
  'FAITH',                // already present
  'PASTOR',               // already present
  'DONGO',                // already present
  'DEL',                  // already present
  'OZZY',                 // already present
  'TSIKIRAI',             // already present
  'IRVINE',               // already present
  'ZHOU',                 // already present
  'TONDE',                // already present
  'TAKU',                 // already present
  'RODDY',                // already present
  'CLIVE',                // already present
  'MUKWIDZA',             // already present
  'ASHTON',               // already present
  'DZOMA',                // already present
  'MOVADO',               // already present
  'MARY',                 // already present
  'TAPIWA',               // already present
  'NOAH',                 // already present
  'TROTE',                // already present
  'TROTE HAULAGE',        // already present
  'FARAI',                // already present
  'VINCENT',              // already present
  'VINICENT',             // already present
  'KNOXFIELD',            // already present
  'MARTIN',               // already present
  'SPENCER',              // already present
  'MR NHIRA',             // already present
  'MAKUNDA',              // already present
  'SAMSON',               // already present
  'ANELKA',               // already present
  'JIMMY',                // already present
  'LAWRENCE',             // already present
  'MR NYAKUTUMBA',        // already present
  'SADMARK',              // already present
  'FUNNY',                // already present
  'MR MANDIVENGEREI',     // already present
  'MR MANDI',             // already present
  'CHIMANYA',             // already present
  'MR CHIMANYA',          // already present
  'TONDERAI',             // already present
  'MUNYA-BYO',            // already present
  'HOSANA',               // already present
  'ZVOUSHE',              // already present
  'STEELFORCE',           // already present
  'KAHARO-HIRE',          // already present
  'ENTERPRISES',          // already present
  'FUNUEL',               // already present
  'FANUEL',               // already present
  'BEYOND TIME',          // already present
  'BEYOND',               // already present
  'ASHTON',               // already present
  'MUKWIDZA',             // already present
  'CLIVE',                // already present
  'TSIKIRAI',             // already present
  'MELUSI-BYO',           // already present
  'MELUSI',               // already present
  'TAWANDA-BYO',          // already present
  'TAWANDA BYO',          // already present
  'TAWANDA',              // already present
  'DZOMA',                // already present
  'TONDERAI',             // already present
  'CHIMANYA',             // already present
  'MR CHIMANYA',          // already present
  'MOVADO',               // already present
  'MARY',                 // already present
  'TAPIWA',               // already present
  'NOAH',                 // already present
  'TROTE',                // already present
  'TROTE HAULAGE',        // already present
  'FARAI',                // already present
  'VINCENT',              // already present
  'VINICENT',             // already present
  'KNOXFIELD',            // already present
  'MARTIN',               // already present
  'SPENCER',              // already present
  'MR NHIRA',             // already present
  'MAKUNDA',              // already present
  'SAMSON',               // already present
  'ANELKA',               // already present
  'JIMMY',                // already present
  'LAWRENCE',             // already present
  'MR NYAKUTUMBA',        // already present
  'SADMARK',              // already present
  'FUNNY',                // already present
  'MR MANDIVENGEREI',     // already present
  'MR MANDI',             // already present
  'MUNYA',                // already present
  'MUNYA-BYO',            // already present
  'DONGO',                // already present
  'PASTOR',               // already present
  'FAITH',                // already present
  'TAKU',                 // already present
  'RODDY',                // already present
  'IRVINE',               // already present
  'ZHOU',                 // already present
  'DEL',                  // already present
  'TONDE',                // already present
  'OZZY',                 // already present
];

// Deduplicate the array (case-insensitive) so the list is clean.
const uniqueNames = Array.from(
  new Set(DRIVER_NAMES.map((n) => n.trim().toUpperCase()).filter(Boolean))
);

function slugToCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
}

async function seedDrivers() {
  const db = await connectToDatabase();
  const collection = db.collection('tbldrivers');
  const now = new Date();

  let inserted = 0;
  let skipped = 0;

  for (const name of uniqueNames) {
    const existing = await collection.findOne({
      tenantId: TENANT_ID,
      isDeleted: { $ne: true },
      name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });

    if (existing) {
      console.log(`Skip (already exists): ${name}`);
      skipped += 1;
      continue;
    }

    await collection.insertOne({
      name,
      driver_code: slugToCode(name),
      status: 'active',
      tenantId: TENANT_ID,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      deletedAt: null,
      createdBy: SEED_USER_ID,
      updatedBy: SEED_USER_ID,
    });

    console.log(`Inserted: ${name}`);
    inserted += 1;
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (already existed).`);
  console.log('Review the list for near-duplicate names (see file header) before relying on it.');
  process.exit(0);
}

seedDrivers().catch((error) => {
  console.error('Driver seeding failed:', error);
  process.exit(1);
});