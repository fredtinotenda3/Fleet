// scripts/check-vehicles-from-import.ts
//
// Reads the massive list of license plates (obtained from your fuel-log
// import CSVs), deduplicates them, and checks which ones already exist in
// `tblvehicles` and which are missing.
//
// Useful before importing fuel logs that reference vehicles – you can
// then decide whether to seed the missing vehicles or adjust the data.
//
// Run with:
//   npx tsx scripts/check-vehicles-from-import.ts
//
// Override tenant / connection via env if needed:
//   SEED_TENANT_ID=acme npx tsx scripts/check-vehicles-from-import.ts

import 'dotenv/config';
import connectToDatabase from '@/infrastructure/database/mongodb';

const TENANT_ID = process.env.SEED_TENANT_ID || 'default';

// ---------------------------------------------------------------------------
// All unique license plates extracted from your provided fuel-log data.
// Duplicates have already been removed (case-insensitive).
// ---------------------------------------------------------------------------
const ALL_PLATES: string[] = [
  'ABY5399', 'ACJ0687', 'ACT0687', 'ADL5345', 'ADW4390', 'ADW9907', 'ADW9908',
  'ADY2531', 'AEN7763', 'AFF7887', 'AFJ7496', 'AFK5777', 'AFL0158', 'AFN1857',
  'AFP7561', 'AFQ0442', 'AFS4296', 'AFU0078', 'AFU8382', 'AFX8537', 'AFX8808',
  'AGA8090', 'AGC3794', 'AGG6890', 'AGN0727', 'AGZ2127', 'AHA2572', 'AKF5777',
  'AEQ2677', 'AFF6840', 'AFK4234', 'AFS6883', 'AFU8486', 'AFX8527', 'AFX8531',
  'AFZ3914', 'AGL3794', 'AEN7767', 'AFG2601', 'AFK4237', 'AFS3296', 'AGE2758',
  'AGZ8034', 'AHA2883', 'AGH5209', 'AGV9782', 'AHF4505', 'AFY4538', 'AFL0594',
  'ADN9908', 'AU3887', 'AFU2382', 'AFU882', 'ACL9863', 'AGT3906', 'AEZ6185',
  'AEZ8777', 'AFK8486', 'AGA7718', 'AC0867', 'AGC0687', 'AFR3655', 'AFS5496',
  'AHA2127', 'ADJ2531', 'AEJ7763', 'AFO1806'
];

// Normalize to uppercase just in case
const PLATES = [...new Set(ALL_PLATES.map(p => p.trim().toUpperCase()))];

async function checkVehicles() {
  const db = await connectToDatabase();
  const vehiclesCol = db.collection('tblvehicles');

  // Fetch all vehicles matching any of these plates for this tenant
  const foundDocs = await vehiclesCol.find({
    tenantId: TENANT_ID,
    license_plate: { $in: PLATES },
    isDeleted: { $ne: true },
  }).toArray();

  const foundPlates = new Set(foundDocs.map(doc => doc.license_plate.toUpperCase()));
  const missingPlates = PLATES.filter(plate => !foundPlates.has(plate));

  console.log('========== Vehicle Check Results ==========');
  console.log(`Total unique plates checked : ${PLATES.length}`);
  console.log(`Found in database           : ${foundPlates.size}`);
  console.log(`Missing from database       : ${missingPlates.length}`);

  if (foundDocs.length > 0) {
    console.log('\n--- Existing Vehicles ---');
    foundDocs.forEach(doc => {
      console.log(`${doc.license_plate} (${doc.make} ${doc.model}) - type: ${doc.vehicle_type}`);
    });
  }

  if (missingPlates.length > 0) {
    console.log('\n--- Missing Plates (not in tblvehicles) ---');
    missingPlates.forEach(p => console.log(p));
  }

  console.log('\nIf you need to seed the missing vehicles, you can use a modified version');
  console.log('of the seed script that creates vehicle documents.');
  process.exit(0);
}

checkVehicles().catch((error) => {
  console.error('Vehicle check failed:', error);
  process.exit(1);
});