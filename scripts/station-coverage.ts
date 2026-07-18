// scripts/station-coverage.ts
import { MongoClient } from 'mongodb';

async function main() {
  const uri = 'mongodb://Stanley:1011@ac-gbuzgwb-shard-00-00.ikpkkxe.mongodb.net:27017,ac-gbuzgwb-shard-00-01.ikpkkxe.mongodb.net:27017,ac-gbuzgwb-shard-00-02.ikpkkxe.mongodb.net:27017/?ssl=true&replicaSet=atlas-tgzz8t-shard-0&authSource=admin&appName=Cluster0';
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db('VehicleExpense').collection('tblfuellogs');

  const [total, withStation, withoutStation, withDriver] = await Promise.all([
    col.countDocuments(),
    col.countDocuments({ fuel_station_id: { $exists: true, $ne: null, $ne: '' } }),
    col.countDocuments({ $or: [{ fuel_station_id: { $exists: false } }, { fuel_station_id: null }, { fuel_station_id: '' }] }),
    col.countDocuments({ driver_id: { $exists: true, $ne: null, $ne: '' } }),
  ]);

  console.log(`Total rows:              ${total}`);
  console.log(`With fuel_station_id:   ${withStation}`);
  console.log(`Without fuel_station_id: ${withoutStation}`);
  console.log(`With driver_id:          ${withDriver}`);

  await client.close();
}

main().catch(console.error);