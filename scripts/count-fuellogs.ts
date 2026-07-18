// scripts/count-fuellogs.ts
import { MongoClient } from 'mongodb';

async function main() {
  const uri = 'mongodb://Stanley:1011@ac-gbuzgwb-shard-00-00.ikpkkxe.mongodb.net:27017,ac-gbuzgwb-shard-00-01.ikpkkxe.mongodb.net:27017,ac-gbuzgwb-shard-00-02.ikpkkxe.mongodb.net:27017/?ssl=true&replicaSet=atlas-tgzz8t-shard-0&authSource=admin&appName=Cluster0';
  const client = new MongoClient(uri);
  await client.connect();
  const count = await client.db('VehicleExpense').collection('tblfuellogs').countDocuments();
  console.log('Current tblfuellogs count:', count);
  await client.close();
}

main().catch(console.error);