// scripts/station-coverage.ts
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI environment variable is not defined');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db('VehicleExpense').collection('tblfuellogs');

  const [total, withStation, withoutStation, withDriver] = await Promise.all([
    col.countDocuments(),
    col.countDocuments({ fuel_station_id: { $exists: true, $nin: [null, ''] } }),
    col.countDocuments({ $or: [{ fuel_station_id: { $exists: false } }, { fuel_station_id: null }, { fuel_station_id: '' }] }),
    col.countDocuments({ driver_id: { $exists: true, $nin: [null, ''] } }),
  ]);

  console.log(`Total rows:              ${total}`);
  console.log(`With fuel_station_id:   ${withStation}`);
  console.log(`Without fuel_station_id: ${withoutStation}`);
  console.log(`With driver_id:          ${withDriver}`);

  await client.close();
}

main().catch(console.error);