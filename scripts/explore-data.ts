// scripts/explore-data.ts
// Lists all collections in VehicleExpense, prints up to 4 docs each,
// and writes a full report to a timestamped Markdown file.
import { MongoClient, Db } from 'mongodb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'VehicleExpense';
const SAMPLE_SIZE = 4; // 👈 up to 4 documents per collection

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUTPUT_FILE = path.join(process.cwd(), `db-explore-${timestamp}.md`);

if (!MONGO_URI) {
  console.error('❌ MONGODB_URI is not defined. Check your .env file.');
  process.exit(1);
}

function logAndSave(text: string) {
  console.log(text);
  fs.appendFileSync(OUTPUT_FILE, text + '\n', 'utf-8');
}

async function printCollectionSample(db: Db, collectionName: string) {
  const coll = db.collection(collectionName);
  try {
    const docs = await coll.find().limit(SAMPLE_SIZE).toArray();

    if (docs.length === 0) {
      logAndSave(`  >>> EMPTY COLLECTION <<<`);
      return;
    }

    docs.forEach((doc, i) => {
      logAndSave(`  Document ${i + 1}:`);
      logAndSave('  ```json');
      logAndSave(JSON.stringify(doc, null, 2));
      logAndSave('  ```');
    });

    const total = await coll.estimatedDocumentCount();
    if (total > docs.length) {
      logAndSave(`  *... and approximately ${total - docs.length} more document(s).*`);
    }
  } catch (err) {
    logAndSave(`  ❌ Error reading collection "${collectionName}": ${err}`);
  }
}

async function main() {
  fs.writeFileSync(
    OUTPUT_FILE,
    `# Database Exploration Report\n**Database:** ${DATABASE_NAME}\n**Generated:** ${new Date().toISOString()}\n**Sample size:** up to ${SAMPLE_SIZE} documents per collection\n\n`,
    'utf-8'
  );

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    logAndSave('✅ Connected to MongoDB.\n');

    const db = client.db(DATABASE_NAME);
    logAndSave(`## Database: ${DATABASE_NAME}\n`);

    const collections = await db.listCollections().toArray();
    if (collections.length === 0) {
      logAndSave('No collections found in this database.');
      return;
    }

    for (const { name } of collections) {
      logAndSave(`### Collection: \`${name}\`\n`);
      await printCollectionSample(db, name);
      logAndSave('');
    }
  } catch (error) {
    logAndSave(`❌ Fatal error: ${error}`);
  } finally {
    await client.close();
  }

  logAndSave(`\n---\nReport saved to: \`${OUTPUT_FILE}\``);
}

main();