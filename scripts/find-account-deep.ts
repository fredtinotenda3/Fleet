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

  console.log('Searching collections...');
  const collections = await db.listCollections().toArray();

  for (const collInfo of collections) {
    const name = collInfo.name;

    if (name.startsWith('system.')) continue;

    let docs: any[] = [];

    try {
      docs = await db.collection(name).find({}).limit(2000).toArray();
    } catch {
      continue;
    }

    for (const doc of docs) {
      const flat = JSON.stringify(doc).toLowerCase();

      if (flat.includes(email.toLowerCase())) {
        console.log(`\nMATCH in ${name}`);
        console.log('Top-level keys:', Object.keys(doc).join(', '));
        console.log('Email-like fields:', Object.keys(doc).filter((k) => /email/i.test(k)).join(', '));
        console.log('Password-like fields:', Object.keys(doc).filter((k) => /password|passwd|pwd|hash/i.test(k)).join(', '));

        if (doc.members && Array.isArray(doc.members)) {
          const member = doc.members.find((m: any) => m.email?.toLowerCase() === email.toLowerCase());
          if (member) {
            console.log('Found matching member inside members[]');
            console.log('Member keys:', Object.keys(member).join(', '));
          }
        }

        await client.close();
        return;
      }
    }
  }

  console.log('No match found.');
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});