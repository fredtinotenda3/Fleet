// scripts/backfill-transport-cost-normalization.ts
//
// WHY THIS IS NEEDED
// ---------------------------------------------------------------------
// import-transport-cost.handler.ts's normalizeRow() runs Phase O2
// matching (normalizationMatcherService.matchTransporter/matchVehicle)
// immediately after a row is saved, but it is explicitly BEST-EFFORT:
// see that handler's own comment above the call site -- "Never lets a
// matching failure turn an otherwise-successful import row into a
// reported failure ... normalization is auxiliary bookkeeping that a
// human can always retry via the review queue or the backfill script
// (scripts/backfill-transport-cost-normalization.ts)". That comment
// named THIS file. It did not exist. If normalizeRow throws for a row
// (any error inside the matcher or the O2 repositories -- a query
// timeout, a cold-start hiccup, a schema issue), the only trace is a
// server-side console.error; the import still reports success, the row
// is durably saved, but no NormalizationReviewItem is ever filed for
// it. The result is a row that Command Centre correctly reports as
// "unresolved transporter" / "unresolved vehicle" (that count reads
// transporterPartnerId/contractedVehicleId directly off the source
// record -- see TransportCostSourceRecordRepository.classifyDataQualityIssues)
// forever, because nothing ever created the review-queue item that
// would let a human resolve it. The review queue and the data-quality
// panel are not disagreeing about two different things; one of them
// (the review queue) is reading a collection that normalization never
// successfully wrote to.
//
// WHAT THIS SCRIPT DOES
// ---------------------------------------------------------------------
// For one tenant, finds every non-deleted TransportCostSourceRecord
// with an unresolved transporter (transporterPartnerId unset) or an
// unresolved vehicle (registration present, contractedVehicleId unset)
// and re-runs the EXACT SAME matcher calls normalizeRow makes at import
// time -- normalizationMatcherService.matchTransporter/matchVehicle,
// not a reimplementation of their logic. A row that now resolves
// against an already-confirmed identity is patched immediately, exactly
// as it would have been at import time; everything else is filed (or
// appended, per the existing "one item per distinct raw value" dedup)
// into the normalization review queue, where a human works it via the
// Review Queue page or scripts/review-normalization-queue.ts.
//
// SAFE TO RE-RUN. fileOrAppendReviewItem's own dedup (one pending item
// per distinct (kind, rawValue) per tenant) means running this twice
// never creates duplicate review items -- a row already queued just
// gets appended to the same item's sourceRecordIds ($addToSet), a
// no-op if it's already there. A row already resolved is excluded by
// this script's own selection filter, so it is never re-matched.
//
// WHAT THIS SCRIPT DOES NOT DO
// ---------------------------------------------------------------------
//   * It never creates or confirms a TransportPartner/ContractedVehicle
//     itself, and never auto-merges a fuzzy match -- same "suggest
//     only" rule as the matcher it calls. A human still confirms every
//     review item via the Review Queue page or the CLI script above.
//   * It never touches amount/date/postedStatus. Posting is unaffected
//     and unrelated -- see scripts/post-transport-cost-batch.ts for that
//     step, which still only posts rows whose identities are already
//     resolved (deriveOperationalStatus's 'ready-to-post' gate).
//
// Usage:
//   npx tsx scripts/backfill-transport-cost-normalization.ts --org <tenantId>              # dry run -- counts only, no writes
//   npx tsx scripts/backfill-transport-cost-normalization.ts --org <tenantId> --confirm     # apply

import 'dotenv/config';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { transportCostSourceRecordRepository } from '@/modules/transport-cost/repositories/transport-cost-source-record.repository';
import { normalizationMatcherService } from '@/modules/transport-cost/services/normalization-matcher.service';
import type { TransportCostSourceRecord } from '@/shared/types/transport-cost.types';
import type { Filter } from 'mongodb';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * The same "unresolved transporter OR unresolved vehicle" condition as
 * TransportCostSourceRecordRepository.classifyDataQualityIssues's
 * 'unresolvedTransporter'/'unresolvedVehicle' branches -- read directly
 * off the two fields those branches test
 * (transporterPartnerId / registration+contractedVehicleId), not a
 * reimplementation of the private method itself. A row missing BOTH is
 * matched once and both matcher calls run on it, same as normalizeRow.
 */
function buildUnresolvedFilter(): Filter<TransportCostSourceRecord> {
  return {
    $or: [
      { transporterPartnerId: { $exists: false } },
      { transporterPartnerId: null },
      {
        $and: [
          { registration: { $ne: null } },
          { $or: [{ contractedVehicleId: { $exists: false } }, { contractedVehicleId: null }] },
        ],
      },
    ],
  } as Filter<TransportCostSourceRecord>;
}

async function main(): Promise<void> {
  const tenantId = argValue('org');
  const confirm = hasFlag('confirm');
  const sheetFamily = argValue('family'); // optional filter: third-party|swift|vansales|depot-sto

  if (!tenantId) {
    console.error('--org <tenantId> is required (the same tenant slug used with review-normalization-queue.ts / post-transport-cost-batch.ts).');
    process.exit(1);
  }

  await connectToDatabase();
  // No CQRS bootstrap here, deliberately: this script calls
  // normalizationMatcherService and transportCostSourceRecordRepository
  // directly, exactly as import-transport-cost.handler.ts's own
  // normalizeRow() does internally -- never through commandBus/queryBus
  // -- so there is no handler-registration step to skip or forget (see
  // review-normalization-queue.ts's header for the class of bug that
  // affects command/query-bus-routed scripts; it does not apply here).

  const filter = buildUnresolvedFilter();
  const candidates = await transportCostSourceRecordRepository.findMany(
    sheetFamily ? ({ ...filter, sheetFamily } as Filter<TransportCostSourceRecord>) : filter,
    tenantId,
    { limit: 100000 }
  );

  console.log('');
  console.log(`${BOLD}Transport-cost normalization backfill -- ${tenantId}${RESET}${sheetFamily ? ` (family: ${sheetFamily})` : ''}`);
  console.log(`${DIM}${candidates.length} row(s) currently unresolved (unresolved transporter and/or unresolved vehicle)${RESET}`);
  console.log(`${DIM}${'='.repeat(88)}${RESET}`);

  if (candidates.length === 0) {
    console.log(`${GREEN}Nothing to do.${RESET} Every source record in scope already resolves.`);
    return;
  }

  if (!confirm) {
    const byFamily = new Map<string, number>();
    for (const row of candidates) {
      byFamily.set(row.sheetFamily, (byFamily.get(row.sheetFamily) ?? 0) + 1);
    }
    console.log(`${YELLOW}DRY RUN${RESET} -- no writes made. Breakdown by family:`);
    for (const [family, count] of byFamily) {
      console.log(`  ${family}: ${count}`);
    }
    console.log('');
    console.log(`Re-run with ${BOLD}--confirm${RESET} to file these into the normalization review queue`);
    console.log(`(or resolve them immediately, for any that now match an already-confirmed identity).`);
    return;
  }

  let resolvedTransporter = 0;
  let resolvedVehicle = 0;
  let queuedTransporter = 0;
  let queuedVehicle = 0;
  let blocked = 0;
  let errors = 0;

  for (const row of candidates) {
    try {
      const patch: Partial<Pick<TransportCostSourceRecord, 'transporterPartnerId' | 'contractedVehicleId'>> = {};

      const needsTransporter = !row.transporterPartnerId;
      const needsVehicle = Boolean(row.registration) && !row.contractedVehicleId;

      if (needsTransporter) {
        const transporterMatch = await normalizationMatcherService.matchTransporter(
          row.transporterNormalized,
          row._id!,
          tenantId
        );
        if (transporterMatch.outcome === 'resolved-confirmed') {
          patch.transporterPartnerId = transporterMatch.transporterPartnerId;
          resolvedTransporter += 1;
        } else if (transporterMatch.outcome === 'pending-review') {
          queuedTransporter += 1;
        } else if (transporterMatch.outcome === 'blocked') {
          blocked += 1;
        }
      }

      if (needsVehicle) {
        const vehicleMatch = await normalizationMatcherService.matchVehicle(
          row.registrationRaw,
          row.registration,
          row._id!,
          tenantId
        );
        if (vehicleMatch.outcome === 'resolved-confirmed') {
          patch.contractedVehicleId = vehicleMatch.contractedVehicleId;
          resolvedVehicle += 1;
        } else if (vehicleMatch.outcome === 'pending-review') {
          queuedVehicle += 1;
        }
      }

      if (Object.keys(patch).length > 0) {
        await transportCostSourceRecordRepository.update(row._id!, patch, tenantId);
      }
    } catch (err) {
      errors += 1;
      console.error(
        `${RED}[backfill] failed for row ${row._id} (${row.sheetFamily}):${RESET}`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log('');
  console.log(`${GREEN}Done.${RESET}`);
  console.log(`  resolved immediately -- transporter: ${resolvedTransporter}, vehicle: ${resolvedVehicle}`);
  console.log(`  filed to review queue -- transporter: ${queuedTransporter}, vehicle: ${queuedVehicle}`);
  if (blocked > 0) console.log(`  ${YELLOW}blocked (known-invalid transporter label): ${blocked}${RESET}`);
  if (errors > 0) console.log(`  ${RED}errors: ${errors} -- see messages above${RESET}`);
  console.log('');
  console.log(`Next: npx tsx scripts/review-normalization-queue.ts list --org ${tenantId}`);
  console.log(`(or the Review Queue page) to confirm the newly-filed items.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
