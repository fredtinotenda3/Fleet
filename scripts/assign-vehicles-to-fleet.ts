import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI!;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const tenantId = 'willsgrove-farm-enterprises-9e80ed';

  const harareHeavyFleet = await db.collection('tblorgunits').findOne({
    tenantId,
    name: 'Harare Heavy Fleet',
  });
  const logisticsDept = await db.collection('tblorgunits').findOne({
    tenantId,
    name: 'Logistics Department',
  });

  if (!harareHeavyFleet || !logisticsDept) {
    console.error('Could not find required org units. Has tenancy:provision been run with --confirm?');
    process.exit(1);
  }

  // Assign ALL vehicles to Harare Heavy Fleet
  const vehiclesResult = await db.collection('tblvehicles').updateMany(
    { tenantId, orgUnitId: { $exists: false } },
    { $set: { orgUnitId: String(harareHeavyFleet._id) } }
  );
  console.log(`Vehicles assigned: ${vehiclesResult.modifiedCount}`);

  // Assign ALL drivers to Logistics Department
  const driversResult = await db.collection('tbldrivers').updateMany(
    { tenantId, orgUnitId: { $exists: false } },
    { $set: { orgUnitId: String(logisticsDept._id) } }
  );
  console.log(`Drivers assigned: ${driversResult.modifiedCount}`);

  await client.close();
  console.log('Done. Now run: npm run tenancy:backfill -- --confirm');
}

main().catch(console.error);