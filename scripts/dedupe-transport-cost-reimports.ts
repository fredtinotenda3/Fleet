// scripts/dedupe-transport-cost-reimports.ts
//
// Your posting run's batch counts revealed something serious: TWO import
// batches each for Vansales (43 + 43 = 86 stored) and Swift (276 + 276 =
// 552 stored), against only ONE batch for 3rd Party (90). That is not
// coincidence -- it is the real workbook having been imported twice, and
// findLikelyDuplicate (transport-cost-source-record.repository.ts) only
// catching it for 3rd Party.
//
// WHY 3rd Party caught it and Vansales/Swift did not: the duplicate
// check requires BOTH a registration AND a date to mean anything (its
// own doc comment: "Without both a registration and a date, this check
// cannot mean anything -- fall through and let the row import"). 3rd
// Party rows have both. Vansales rows ALWAYS have date === null (it's a
// fixed retainer, not a dated shipment -- see
// transport-cost-posting.service.ts's own header). Swift rows ALWAYS
// have registration === null (the source has no registration/transporter
// column at all -- SWIFT_POSTING_DECISION.md). So every Vansales and
// Swift re-import silently sailed past the duplicate check and inserted
// a second, real copy of every row. Posting these as-is would double
// Olivine's real Vansales and Swift costs on the report page -- this
// must be cleaned up BEFORE running post-transport-cost-batch.ts against
// these two families.
//
// IDENTIFICATION, independent of the broken date/registration check:
// the same (sheetFamily, sourceFileName, sourceRowNumber) appearing more
// than once for this tenant can ONLY mean the same physical row of the
// same physical file was imported more than once -- there is no other
// way for that exact combination to recur. For each such group, this
// script keeps the EARLIEST-imported copy (by importedAt) and soft-
// deletes the rest (isDeleted: true, deletedAt set -- recoverable,
// matching this codebase's established soft-delete convention; nothing
// is hard-deleted). Cross-checks rawRow content matches exactly between
// kept and removed copies before touching anything, as a second,
// independent confirmation these truly are the same row, not a
// coincidental row-number collision across different files.
//
// Usage:
//   npx tsx scripts/dedupe-transport-cost-reimports.ts --org <tenantId>              (report only, no writes)
//   npx tsx scripts/dedupe-transport-cost-reimports.ts --org <tenantId> --execute --user-email <email>   (actually soft-delete the extras)

import 'dotenv/config';
import type { TransportCostSourceRecord } from '@/shared/types/transport-cost.types';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function rawRowsMatch(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
  return aKeys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

async function main(): Promise<void> {
  const tenantId = argValue('org');
  const execute = hasFlag('execute');
  const userEmail = argValue('user-email');

  if (!tenantId) {
    console.error('--org <tenantId> is required.');
    process.exit(1);
  }
  if (execute && !userEmail) {
    console.error('--user-email <email> is required with --execute, for the deletedBy audit trail.');
    process.exit(1);
  }

  const connectToDatabase = (await import('@/infrastructure/database/mongodb')).default;
  const { transportCostSourceRecordRepository } = await import(
    '@/modules/transport-cost/repositories/transport-cost-source-record.repository'
  );

  await connectToDatabase();

  let userId: string | undefined;
  if (execute) {
    const { adminUserRepository } = await import('@/modules/organizations/repositories/admin-user.repository');
    const account = await adminUserRepository.findByEmail(userEmail!.toLowerCase());
    if (!account) {
      console.error(`No tbladmin account found for "${userEmail!.toLowerCase()}". Check spelling.`);
      process.exit(1);
    }
    userId = account._id!.toString();
  }

  console.log(`\n${BOLD}Loading all source records for ${tenantId}...${RESET}`);
  const records = await transportCostSourceRecordRepository.findMany({}, tenantId, { limit: 5000 });
  console.log(`${records.length} total record(s) loaded.\n`);

  const groups = new Map<string, TransportCostSourceRecord[]>();
  for (const r of records) {
    const key = `${r.sheetFamily}|${r.sourceFileName}|${r.sourceRowNumber}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const duplicateGroups = Array.from(groups.entries()).filter(([, list]) => list.length > 1);
  const byFamily: Record<string, number> = {};
  let totalExtras = 0;
  let mismatchedContent = 0;

  for (const [, list] of duplicateGroups) {
    list.sort((a, b) => new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime());
    const [keep, ...extras] = list;
    byFamily[keep.sheetFamily] = (byFamily[keep.sheetFamily] ?? 0) + extras.length;
    totalExtras += extras.length;
    for (const extra of extras) {
      if (!rawRowsMatch(keep.rawRow, extra.rawRow)) mismatchedContent++;
    }
  }

  console.log(`${BOLD}Duplicate groups found: ${duplicateGroups.length}${RESET} (same file + same row number, imported more than once)`);
  for (const [family, count] of Object.entries(byFamily)) {
    console.log(`  ${family}: ${count} extra record(s) to remove`);
  }
  console.log(`  ${BOLD}Total extra records: ${totalExtras}${RESET}`);
  if (mismatchedContent > 0) {
    console.log(`  ${RED}WARNING: ${mismatchedContent} of these do NOT have identical rawRow content to the kept copy.${RESET}`);
    console.log(`  ${RED}Stopping without deleting anything -- this needs a human look, not an automated guess.${RESET}`);
    process.exit(1);
  }
  console.log(`  ${GREEN}All ${totalExtras} extras have byte-identical rawRow content to the record being kept -- confirmed same row, safe to remove.${RESET}\n`);

  if (totalExtras === 0) {
    console.log(`${GREEN}Nothing to clean up.${RESET}\n`);
    process.exit(0);
  }

  if (!execute) {
    console.log(`${YELLOW}Report only -- nothing deleted. Re-run with --execute --user-email <email> to soft-delete the ${totalExtras} extra record(s).${RESET}\n`);
    process.exit(0);
  }

  console.log(`${BOLD}Soft-deleting ${totalExtras} extra record(s)...${RESET}`);
  let deleted = 0;
  let failed = 0;
  for (const [, list] of duplicateGroups) {
    list.sort((a, b) => new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime());
    const [, ...extras] = list;
    for (const extra of extras) {
      const ok = await transportCostSourceRecordRepository.softDelete(extra._id!, tenantId, userId);
      if (ok) deleted++;
      else failed++;
    }
  }
  console.log(`${GREEN}${deleted} soft-deleted${RESET}${failed > 0 ? `, ${RED}${failed} failed${RESET}` : ''}.\n`);
  console.log(`Re-run scripts/diagnose-transport-cost-duplicates.ts (or this script again) to confirm the counts now look right,`);
  console.log(`then proceed to post-transport-cost-batch.ts.\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
