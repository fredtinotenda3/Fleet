// scripts/set-super-admin.ts
// Sets fredtinotenda3@gmail.com as super_admin with a chosen password.
// Run once against the production database.

import { MongoClient } from 'mongodb';
import { hash } from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const email = 'fredtinotenda3@gmail.com';
  const password = await hash('stanleyFred@1011', 10);

  await db.collection('tbladmin').updateOne(
    { Email: email },
    {
      $set: {
        Password: password,
        roles: ['super_admin'],
        Role: 'super_admin',
      },
    }
  );

  console.log(`Updated ${email} — role: super_admin, password: stanleyFred@1011`);
  await client.close();
}

main().catch(console.error);