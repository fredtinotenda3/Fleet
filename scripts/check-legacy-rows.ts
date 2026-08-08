// scripts/check-legacy-rows.ts
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_NAME = 'VehicleExpense';

async function checkLegacyRows(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI environment variable is not defined');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection('tblfuellogs'); // adjust if collection name differs

    const filter: Record<string, unknown> = {
      $or: [
        { fuel_station_id: null },
        { fuel_station_id: { $exists: false } },
        { fuel_station_id: { $type: 'string' } },
        { driver_id: null },
        { driver_id: { $exists: false } },
        { driver_id: { $type: 'string' } },
      ],
    };

    const cursor = collection.find(filter).limit(10);
    let count = 0;

    console.log('=== Legacy Rows (fuel_station_id, driver_id, station_name) ===\n');

    for await (const doc of cursor) {
      count++;
      console.log(`Row ${count}  (_id: ${doc._id})`);
      console.log(`  fuel_station_id : ${JSON.stringify(doc.fuel_station_id)}  (type: ${typeof doc.fuel_station_id})`);
      console.log(`  driver_id       : ${JSON.stringify(doc.driver_id)}  (type: ${typeof doc.driver_id})`);
      console.log(`  station_name    : ${JSON.stringify(doc.station_name)}`);
      console.log('---');
    }

    if (count === 0) {
      console.log('No legacy rows found with that filter. Try a broader query.');
    }

    console.log(`\nTotal displayed: ${count}`);
  } finally {
    await client.close();
  }
}

checkLegacyRows().catch(console.error);