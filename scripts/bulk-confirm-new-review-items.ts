// scripts/bulk-confirm-new-review-items.ts
//
// Your real January import created 117 pending normalization review
// items -- confirming each with review-normalization-queue.ts one at a
// time would mean 117 separate commands. This script automates ONLY the
// mechanical, unambiguous part of that: it never overrides a fuzzy-match
// suggestion, and it never guesses at a real identity decision. It
// confirms a review item as a brand-new entity ONLY when the
// normalization matcher itself already found no candidate at all
// (candidateEntityId is absent -- see normalization-review.types.ts's
// own doc comment: "Absent when no candidate cleared it"). Any item
// that DOES have a candidate suggestion is left untouched and printed
// for you to resolve by hand with review-normalization-queue.ts's
// confirm-match/confirm-new/reject -- that is a real "is this the same
// company, spelled differently" judgment call, exactly the one
// OLIVINE_DATA_IMPORT_GUIDE.md section 0 says must stay a human decision.
//
// TWO PASSES, IN ORDER, because ConfirmReviewNewHandler enforces a real
// business rule: a ContractedVehicle cannot exist without a
// transporterPartnerId (see that handler's own header -- "a vehicle
// cannot exist without a transporter"). So:
//
//   Pass 1 -- TRANSPORTERS. Every no-candidate 'transporter' item is
//   confirmed as new. No dependency, always safe to do first.
//
//   Pass 2 -- VEHICLES. For each no-candidate 'vehicle' item, this
//   script looks up ONE of its underlying source records (sourceRecordIds[0])
//   and reads which transporter that same row named
//   (transporterNormalized). If that transporter was just confirmed in
//   Pass 1 (or already existed before this run), the vehicle is
//   confirmed as new, linked to that transporter. If the transporter
//   can't be resolved with confidence -- it doesn't exist yet, or the
//   source row is missing a transporter -- the vehicle is skipped and
//   printed for manual review rather than guessed at.
//
// Every created vehicle is stamped with --business-stream (default
// "olivine", since that's the only stream this January workbook
// contains -- override if you're running this against different data).
//
// Usage:
//   npx tsx scripts/bulk-confirm-new-review-items.ts --org <tenantId> --user-email <email> [--business-stream olivine] [--dry-run]
//
// --dry-run reports exactly what it WOULD confirm and what it would
// skip, without calling any command (no writes).

import 'dotenv/config';
import type { BusinessStream } from '@/shared/types/contracted-vehicle.types';
import type { NormalizationReviewItem } from '@/shared/types/normalization-review.types';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
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

/** Same normalization the matcher itself uses for comparison -- upper-cased,
 *  whitespace-collapsed -- so a transporter confirmed in Pass 1 reliably
 *  matches the raw transporter name found on a vehicle's source row in
 *  Pass 2, regardless of incidental casing/spacing differences. */
function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

async function main(): Promise<void> {
  const tenantId = argValue('org');
  const userEmail = argValue('user-email');
  const businessStream = (argValue('business-stream') ?? 'olivine') as BusinessStream;
  const dryRun = hasFlag('dry-run');

  if (!tenantId) {
    console.error('--org <tenantId> is required.');
    process.exit(1);
  }
  if (!userEmail) {
    console.error('--user-email <email> is required, so the audit trail points at a real person.');
    process.exit(1);
  }

  const connectToDatabase = (await import('@/infrastructure/database/mongodb')).default;
  const { bootstrapCqrs } = await import('@/server/cqrs/cqrs.module');
  const { adminUserRepository } = await import('@/modules/organizations/repositories/admin-user.repository');
  const { transportCostQueryService } = await import('@/modules/transport-cost/services/transport-cost-query.service');
  const { transportCostCommandService } = await import('@/modules/transport-cost/services/transport-cost-command.service');
  const { transportCostSourceRecordRepository } = await import(
    '@/modules/transport-cost/repositories/transport-cost-source-record.repository'
  );

  await connectToDatabase();
  bootstrapCqrs();

  const account = await adminUserRepository.findByEmail(userEmail.toLowerCase());
  if (!account) {
    console.error(`No tbladmin account found for "${userEmail.toLowerCase()}". Check spelling.`);
    process.exit(1);
  }
  const userId = account._id!.toString();

  async function fetchAllPending(kind: 'transporter' | 'vehicle'): Promise<NormalizationReviewItem[]> {
    const items: NormalizationReviewItem[] = [];
    let page = 1;
    for (;;) {
      const result = await transportCostQueryService.listNormalizationReviewQueue(tenantId!, { page, limit: 100 }, kind);
      items.push(...result.data);
      if (!result.pagination.hasNext) break;
      page++;
    }
    return items;
  }

  console.log(`\n${BOLD}Loading pending review queue for ${tenantId}...${RESET}`);
  const transporterItems = await fetchAllPending('transporter');
  const vehicleItems = await fetchAllPending('vehicle');

  const transporterNoCandidate = transporterItems.filter((i) => !i.candidateEntityId);
  const transporterHasCandidate = transporterItems.filter((i) => i.candidateEntityId);
  const vehicleNoCandidate = vehicleItems.filter((i) => !i.candidateEntityId);
  const vehicleHasCandidate = vehicleItems.filter((i) => i.candidateEntityId);

  console.log(`Transporters pending: ${transporterItems.length} (${transporterNoCandidate.length} no-candidate, ${transporterHasCandidate.length} have a suggested match -- skipped, see below)`);
  console.log(`Vehicles pending:     ${vehicleItems.length} (${vehicleNoCandidate.length} no-candidate, ${vehicleHasCandidate.length} have a suggested match -- skipped, see below)\n`);

  if (dryRun) {
    console.log(`${GREEN}Dry run only -- nothing confirmed, nothing written.${RESET}`);
  }

  // --- Pass 1: transporters -------------------------------------------------
  console.log(`${BOLD}Pass 1 -- transporters (${transporterNoCandidate.length})${RESET}`);
  const confirmedTransporterIdByName = new Map<string, string>();
  for (const item of transporterNoCandidate) {
    const key = normalizeKey(item.rawValue);
    if (dryRun) {
      console.log(`  ${GREEN}would confirm-new${RESET}  [transporter] "${item.rawValue}"`);
      confirmedTransporterIdByName.set(key, `DRY-RUN-${item._id}`);
      continue;
    }
    try {
      const result = await transportCostCommandService.confirmReviewNew(item._id!, tenantId, userId);
      confirmedTransporterIdByName.set(key, result.createdEntityId);
      console.log(`  ${GREEN}confirmed${RESET}  [transporter] "${item.rawValue}" -> ${result.createdEntityId}`);
    } catch (err) {
      console.log(`  ${RED}failed${RESET}  [transporter] "${item.rawValue}": ${err instanceof Error ? err.message : err}`);
    }
  }

  // --- Pass 2: vehicles, dependent on Pass 1 --------------------------------
  console.log(`\n${BOLD}Pass 2 -- vehicles (${vehicleNoCandidate.length})${RESET}`);
  let vehiclesConfirmed = 0;
  let vehiclesSkippedNoTransporter = 0;
  for (const item of vehicleNoCandidate) {
    const firstSourceId = item.sourceRecordIds[0];
    if (!firstSourceId) {
      console.log(`  ${YELLOW}skip${RESET}  [vehicle] "${item.rawValue}" -- no source record to resolve its transporter from`);
      vehiclesSkippedNoTransporter++;
      continue;
    }
    const source = await transportCostSourceRecordRepository.findById(firstSourceId, tenantId);
    const transporterName = source?.transporterNormalized ?? source?.transporterRaw;
    if (!transporterName) {
      console.log(`  ${YELLOW}skip${RESET}  [vehicle] "${item.rawValue}" -- its source row has no transporter to link to (needs manual review)`);
      vehiclesSkippedNoTransporter++;
      continue;
    }
    const transporterPartnerId = confirmedTransporterIdByName.get(normalizeKey(transporterName));
    if (!transporterPartnerId) {
      console.log(
        `  ${YELLOW}skip${RESET}  [vehicle] "${item.rawValue}" -- transporter "${transporterName}" was not confirmed in Pass 1 (it may already be a confirmed transporter from before this run, or it has its own pending review item with a candidate suggestion -- resolve that first, then re-run this script)`
      );
      vehiclesSkippedNoTransporter++;
      continue;
    }
    if (dryRun) {
      console.log(`  ${GREEN}would confirm-new${RESET}  [vehicle] "${item.rawValue}" -> transporter ${transporterName}`);
      vehiclesConfirmed++;
      continue;
    }
    try {
      const result = await transportCostCommandService.confirmReviewNew(
        item._id!,
        tenantId,
        userId,
        transporterPartnerId,
        businessStream
      );
      console.log(`  ${GREEN}confirmed${RESET}  [vehicle] "${item.rawValue}" -> ${result.createdEntityId} (transporter: ${transporterName})`);
      vehiclesConfirmed++;
    } catch (err) {
      console.log(`  ${RED}failed${RESET}  [vehicle] "${item.rawValue}": ${err instanceof Error ? err.message : err}`);
    }
  }

  // --- Summary ---------------------------------------------------------------
  console.log(`\n${DIM}${'='.repeat(72)}${RESET}`);
  console.log(`${BOLD}Summary${RESET}`);
  console.log(`  Transporters confirmed: ${dryRun ? '(dry run) ' : ''}${transporterNoCandidate.length}`);
  console.log(`  Vehicles confirmed:     ${dryRun ? '(dry run) ' : ''}${vehiclesConfirmed}`);
  console.log(`  Vehicles skipped (transporter unresolved): ${vehiclesSkippedNoTransporter}`);
  console.log(`  Items with a suggested match, left for manual review: ${transporterHasCandidate.length + vehicleHasCandidate.length}`);
  if (transporterHasCandidate.length + vehicleHasCandidate.length > 0) {
    console.log(`\n  ${YELLOW}These have a real candidate suggestion and need a human decision --${RESET}`);
    console.log(`  ${YELLOW}review them with review-normalization-queue.ts (list/confirm-match/confirm-new/reject):${RESET}`);
    for (const item of [...transporterHasCandidate, ...vehicleHasCandidate]) {
      console.log(`    [${item.kind}] "${item.rawValue}" (id ${item._id}) -- candidate score ${item.candidateScore?.toFixed(2)}`);
    }
  }
  console.log(`${DIM}${'='.repeat(72)}${RESET}\n`);

  if (vehiclesSkippedNoTransporter > 0) {
    console.log(`${YELLOW}${vehiclesSkippedNoTransporter} vehicle(s) still need their transporter resolved first -- re-run this script${RESET}`);
    console.log(`${YELLOW}after handling the items listed above, and any newly-visible ones will resolve.${RESET}\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
