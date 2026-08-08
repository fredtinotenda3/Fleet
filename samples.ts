// samples.ts
import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db();
  const tenantId = 'willsgrove-farm-enterprises-9e80ed';
  const cols = ['tbltrips', 'tbldrivers', 'tblvehicles', 'tblfuellogs', 'tblexpenses', 'tblreminders'];
  for (const col of cols) {
    const doc = await db.collection(col).findOne({ tenantId });
    console.log(`\n--- ${col} ---`);
    console.log(JSON.stringify(doc, null, 2));
  }
  await c.close();
}

main().catch(console.error);