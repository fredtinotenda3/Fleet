import { MongoClient } from 'mongodb';
import * as fs from 'fs';

const REDACT_KEYS = [
  'password',
  'passwordHash',
  'hashedPassword',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'keyHash',
  'apiKey',
  'clientSecret',
  'integrationKey',
  'encryptionKey',
  'cronSecret',
  'metricsScrapeToken',
];

function redactObject(obj: any): any {
  if (Array.isArray(obj)) return obj.map(redactObject);

  if (obj && typeof obj === 'object') {
    const result: any = {};

    for (const [key, value] of Object.entries(obj)) {
      if (REDACT_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactObject(value);
      }
    }

    return result;
  }

  return obj;
}

async function main() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not set. Refusing to run.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const collections = await db.listCollections().toArray();
  const output: string[] = [];

  output.push('# Database Collection Schema Sample');
  output.push('');
  output.push('> Generated for project inspection. Sensitive fields redacted.');
  output.push('');
  output.push(`Total collections: ${collections.length}`);
  output.push('');

  for (const collectionInfo of collections) {
    const name = collectionInfo.name;

    if (name.startsWith('system.')) continue;

    const col = db.collection(name);

    let count = 0;
    try {
      count = await col.countDocuments({});
    } catch {
      count = 0;
    }

    output.push(`## ${name}`);
    output.push('');
    output.push(`Estimated record count: ${count}`);
    output.push('');

    const docs = await col.find({}).limit(2).toArray();
    const sanitized = docs.map(redactObject);

    if (sanitized.length === 0) {
      output.push('_No records_');
      output.push('');
      continue;
    }

    output.push('```json');
    output.push(JSON.stringify(sanitized, null, 2));
    output.push('```');
    output.push('');
  }

  await client.close();

  const file = 'db-schema-sample.md';
  fs.writeFileSync(file, output.join('\n'), 'utf8');

  console.log(`Wrote ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});