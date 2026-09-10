import { MongoClient } from 'mongodb';

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Usage: <email>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const collections = await db.listCollections().toArray();

  for (const collInfo of collections) {
    const name = collInfo.name;

    if (name.startsWith('system.')) continue;

    let doc = null;

    try {
      doc = await db.collection(name).findOne({ email });
    } catch {
      continue;
    }

    if (doc) {
      console.log(`FOUND in ${name}`);
      console.log('Keys:', Object.keys(doc).join(', '));
      console.log('Has password-like field:', Object.keys(doc).some((k) => /password|passwd|pwd|hash/i.test(k)));
      await client.close();
      return;
    }
  }

  console.log(`No document with email "${email}" found in any collection.`);
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});