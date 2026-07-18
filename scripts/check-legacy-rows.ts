// scripts/check-legacy-rows.ts
import { MongoClient } from 'mongodb';

// ===== TEMPORARY HARDCODED URI – DELETE AFTER USE =====
const MONGO_URI = 'mongodb://Stanley:1011@ac-gbuzgwb-shard-00-00.ikpkkxe.mongodb.net:27017,ac-gbuzgwb-shard-00-01.ikpkkxe.mongodb.net:27017,ac-gbuzgwb-shard-00-02.ikpkkxe.mongodb.net:27017/?ssl=true&replicaSet=atlas-tgzz8t-shard-0&authSource=admin&appName=Cluster0';
const DB_NAME = 'VehicleExpense';
// =====================================================

async function checkLegacyRows(): Promise<void> {
  const client = new MongoClient(MONGO_URI);
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