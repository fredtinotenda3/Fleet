// scripts/count-fuellogs.ts
//
// PHASE 0, F-6 (found during the repository-wide secret scan, NOT in
// the original audit): this file hardcoded a full MongoDB Atlas
// connection string -- cluster hostnames, database user and PASSWORD --
// as a literal on line 5. Anyone with a clone of this repository had
// direct, unmediated read/write access to the production database,
// bypassing every tenant-scope control in the application layer.
//
// Now reads MONGODB_URI like every other script in this directory. The
// exposed database credential must be treated as COMPROMISED and
// rotated in Atlas -- see SECURITY-CREDENTIALS.md, which already listed
// this user as requiring rotation for a separate exposure.
import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      '[count-fuellogs] MONGODB_URI is not set. Refusing to run.\n' +
        'Set it in .env (which is gitignored) rather than hardcoding a connection string.'
    );
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB || 'VehicleExpense';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const count = await client.db(dbName).collection('tblfuellogs').countDocuments();
    console.log('Current tblfuellogs count:', count);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('[count-fuellogs] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
