// scripts/diagnose-transport-cost-duplicates.ts
//
// Strictly read-only. Written to answer one question directly rather
// than guess at it: your real "JAN-26 3rd Party" import reported
// "0 succeeded, 102 duplicates" out of 109 rows. I independently
// re-parsed your real uploaded workbook outside the app and found 85 of
// those 109 rows have a genuinely UNIQUE (registration, date, amount)
// combination within the sheet itself -- so this collection was NOT
// empty before your import ran, or something is matching more broadly
// than it should. This script counts what is actually in
// tbltransportcostsourcerecords for this tenant right now, and prints a
// few real sample rows, so we settle this with a real read instead of
// a guess. It writes nothing and changes nothing.
//
// Usage:
//   npx tsx scripts/diagnose-transport-cost-duplicates.ts --org <tenantId> [--family third-party]

import 'dotenv/config';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { transportCostSourceRecordRepository } from '@/modules/transport-cost/repositories/transport-cost-source-record.repository';
import type { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const tenantId = argValue('org');
  const family = (argValue('family') ?? 'third-party') as TransportCostSheetFamily;
  if (!tenantId) {
    console.error('--org <tenantId> is required.');
    process.exit(1);
  }

  await connectToDatabase();

  const total = await transportCostSourceRecordRepository.count({}, tenantId);
  const forFamily = await transportCostSourceRecordRepository.count({ sheetFamily: family }, tenantId);

  console.log(`\nTenant ${tenantId}`);
  console.log(`Total tbltransportcostsourcerecords (all families): ${total}`);
  console.log(`Total for sheetFamily="${family}": ${forFamily}\n`);

  if (forFamily === 0) {
    console.log('Nothing stored for this family. If your import reported "duplicates" against an');
    console.log('empty collection, that points at a bug in findLikelyDuplicate itself, not pre-existing data.');
    process.exit(0);
  }

  // Pull every stored record for this family (capped at 500, far above
  // what one sheet import produces) through the repository's own public
  // findMany -- no raw collection access, so this stays within the same
  // tenant-scoping guarantees every other read in this codebase gets.
  const records = await transportCostSourceRecordRepository.findMany({ sheetFamily: family }, tenantId, {
    sortBy: 'importedAt',
    sortOrder: 'asc',
    limit: 500,
  });

  console.log('Oldest 8 stored records for this family:');
  console.log('='.repeat(100));
  for (const doc of records.slice(0, 8)) {
    console.log(
      `registration=${doc.registration ?? doc.registrationRaw}  date=${doc.date ? new Date(doc.date).toISOString().slice(0, 10) : doc.rawDate}  amount=${doc.amount}  ` +
        `importedAt=${doc.importedAt ? new Date(doc.importedAt).toISOString() : 'n/a'}  importBatchId=${doc.importBatchId}  sourceFileName=${doc.sourceFileName}`
    );
  }
  console.log('='.repeat(100));

  const distinctBatches = Array.from(new Set(records.map((r) => r.importBatchId)));
  console.log(`\nDistinct importBatchId values for this family (of the ${records.length} loaded): ${distinctBatches.length}`);
  distinctBatches.forEach((b) => console.log(`  - ${b}`));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
