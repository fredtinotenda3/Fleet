/**
 * Run once to create all MongoDB indexes for the Fleet app.
 * 
 * Usage: npm run db:indexes
 */

// ADD THIS LINE AT THE VERY TOP
import 'dotenv/config';

import { ensureIndexes } from '../infrastructure/database/indexes';

async function main() {
  console.log('Connected to MongoDB. Creating indexes...\n');
  
  await ensureIndexes();
  
  console.log('\nAll indexes created successfully.');
  process.exit(0);
}

main().catch((error) => {
  console.error('Error creating indexes:', error);
  process.exit(1);
});