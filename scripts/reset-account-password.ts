import { MongoClient } from 'mongodb';
import * as bcrypt from 'bcryptjs';

async function main() {
  const email = process.argv[2];
  const newPassword = process.env.NEW_PASSWORD;

  if (!email || !newPassword) {
    console.error('Usage: set NEW_PASSWORD=... then run with <email>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not set. Refusing to run.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const adminCol = db.collection('tbladmin');
  const doc = await adminCol.findOne({ email });

  if (!doc) {
    console.error(`No account found for: ${email}`);
    await client.close();
    process.exit(1);
  }

  const passwordField = Object.keys(doc).find((key) => {
    const value = doc[key];
    return (
      typeof value === 'string' &&
      /password|passwd|pwd|hash/i.test(key) &&
      value.startsWith('$2')
    );
  });

  if (!passwordField) {
    console.error('Could not identify the password hash field on the account.');
    console.error('Account keys:', Object.keys(doc).join(', '));
    await client.close();
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, 10);

  await adminCol.updateOne(
    { email },
    { $set: { [passwordField]: hash } }
  );

  console.log(`Password updated for ${email} using field "${passwordField}".`);

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});