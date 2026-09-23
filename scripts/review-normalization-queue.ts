// scripts/review-normalization-queue.ts
//
// Command-line front end for Phase O2's normalization review queue,
// written because that queue had NO way to be worked at all: the
// service methods (transportCostQueryService.listNormalizationReviewQueue,
// transportCostCommandService.confirmReviewMatch/confirmReviewNew/
// rejectReviewItem) existed, tested, doc-commented with the HTTP route
// paths they expected -- but those route files were never created (see
// app/api/transport-cost/normalization-review/**/route.ts, added
// alongside this script), and no frontend page calls them either. So
// an import could create PENDING review items and there was truly no
// way to ever confirm one outside a raw command invocation.
//
// This script is the fastest safe way to unblock real data end to end
// right now, without also building and shipping a full review-queue UI
// page sight-unseen. The API routes exist too (added alongside this
// script) for whenever that UI gets built; this script calls the exact
// same service layer they do, not a parallel implementation.
//
// WHAT THIS SCRIPT DELIBERATELY DOES NOT DO: decide whether "PRINORTH"
// and "PRI NORTH" are the same transporter, or whether a fuzzy-matched
// candidate is correct. That is a real business judgment call about
// real company/vehicle identity -- per normalization-matcher.service.ts's
// own "suggest only, never auto-merge" rule, and per O2 decision 4 for
// multi-plate rows. `list` shows you the candidate and its similarity
// score so you can decide; nothing here decides for you or applies a
// score threshold as if it were a decision.
//
// Usage:
//   npx tsx scripts/review-normalization-queue.ts list --org <tenantId> [--kind transporter|vehicle] [--page 1] [--limit 50]
//   npx tsx scripts/review-normalization-queue.ts confirm-match --org <tenantId> --id <reviewItemId> --entity <resolvedEntityId> --user-email <email>
//   npx tsx scripts/review-normalization-queue.ts confirm-match --org <tenantId> --id <reviewItemId> --use-candidate --user-email <email>
//   npx tsx scripts/review-normalization-queue.ts confirm-new   --org <tenantId> --id <reviewItemId> --user-email <email> [--business-stream olivine|hypery|surface-wilmar]
//   npx tsx scripts/review-normalization-queue.ts reject        --org <tenantId> --id <reviewItemId> --user-email <email> --reason "..."
//
// --user-email resolves to a real tbladmin account (so resolvedBy/
// rejectedBy/audit trail point at a real person, never a fabricated
// "system" actor) -- pass the email of whoever is actually making the
// call, e.g. the Olivine owner or accountant working the queue.

import 'dotenv/config';
import connectToDatabase from '@/infrastructure/database/mongodb';
// FIX (this script never registered its CQRS handlers): every subcommand
// below dispatches through transportCostCommandService/transportCostQueryService,
// which route through the shared commandBus/queryBus singletons
// (server/cqrs/command-bus.ts, query-bus.ts). Those singletons start with
// zero handlers registered -- registration only happens via bootstrapCqrs(),
// which normally runs once from instrumentation.ts when the Next.js server
// boots. A standalone `npx tsx` invocation like this one never goes through
// instrumentation.ts, so without the explicit call added below, EVERY
// subcommand here (list/confirm-match/confirm-new/reject) throws
// "[CommandBus] No handler registered for command ...". This is the exact
// same class of bug workers/bootstrap.ts's own header comment documents
// and already fixes for the worker process -- this script is a second,
// previously unfixed instance of it. See also
// scripts/import-transport-cost-source-file.ts, which hits and fixes the
// identical issue.
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { adminUserRepository } from '@/modules/organizations/repositories/admin-user.repository';
import { transportCostQueryService } from '@/modules/transport-cost/services/transport-cost-query.service';
import { transportCostCommandService } from '@/modules/transport-cost/services/transport-cost-command.service';
import { transportPartnerRepository } from '@/modules/transport-cost/repositories/transport-partner.repository';
import { contractedVehicleRepository } from '@/modules/transport-cost/repositories/contracted-vehicle.repository';
import type { NormalizationKind } from '@/shared/types/normalization-review.types';
import type { BusinessStream } from '@/shared/types/contracted-vehicle.types';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function argValue(name: string): string | undefined {
  const argv = process.argv.slice(3); // skip node, script path, subcommand
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.slice(3).includes(`--${name}`);
}

async function resolveUserId(): Promise<string> {
  const email = argValue('user-email');
  const rawId = argValue('user');
  if (rawId) return rawId;
  if (!email) {
    console.error('--user-email <email> (or --user <userId>) is required, so the audit trail points at a real person.');
    process.exit(1);
  }
  const account = await adminUserRepository.findByEmail(email);
  if (!account) {
    console.error(`No tbladmin account found for "${email.toLowerCase()}". Check spelling.`);
    process.exit(1);
  }
  return account._id!.toString();
}

async function describeCandidate(kind: NormalizationKind, entityId: string, tenantId: string): Promise<string> {
  try {
    if (kind === 'transporter') {
      const partner = await transportPartnerRepository.findById(entityId, tenantId);
      return partner ? `${partner.canonicalName}` : '(candidate id does not resolve)';
    }
    const vehicle = await contractedVehicleRepository.findById(entityId, tenantId);
    return vehicle ? `${vehicle.registration}` : '(candidate id does not resolve)';
  } catch {
    return '(could not resolve candidate)';
  }
}

async function cmdList(tenantId: string) {
  const kind = argValue('kind') as NormalizationKind | undefined;
  if (kind && kind !== 'transporter' && kind !== 'vehicle') {
    console.error("--kind must be 'transporter' or 'vehicle' when provided.");
    process.exit(1);
  }
  const page = Number(argValue('page') ?? '1');
  const limit = Number(argValue('limit') ?? '50');

  const result = await transportCostQueryService.listNormalizationReviewQueue(tenantId, { page, limit }, kind);

  console.log('');
  console.log(`${BOLD}Normalization review queue -- ${tenantId}${RESET}${kind ? ` (kind: ${kind})` : ''}`);
  console.log(`${DIM}page ${result.pagination.page} of ${Math.max(1, Math.ceil(result.pagination.total / result.pagination.limit))} -- ${result.pagination.total} total${RESET}`);
  console.log(`${DIM}${'='.repeat(88)}${RESET}`);

  if (result.data.length === 0) {
    console.log(`${GREEN}Nothing pending.${RESET} Every review item in this org is already confirmed or rejected.`);
    console.log('');
    return;
  }

  for (const item of result.data) {
    const flags = [item.isMultiPlate ? 'MULTI-PLATE' : null, item.status !== 'pending' ? item.status.toUpperCase() : null]
      .filter(Boolean)
      .join(', ');
    console.log(`${CYAN}${item._id}${RESET}  [${item.kind}]  ${BOLD}"${item.rawValue}"${RESET}${flags ? `  ${YELLOW}(${flags})${RESET}` : ''}`);
    console.log(`  waiting source rows: ${item.sourceRecordIds.length}`);
    if (item.candidateEntityId) {
      const candidateName = await describeCandidate(item.kind, item.candidateEntityId, tenantId);
      const scorePct = item.candidateScore !== undefined ? `${Math.round(item.candidateScore * 100)}%` : '?';
      console.log(
        `  suggested match: ${GREEN}${candidateName}${RESET} (${item.candidateEntityId}) -- similarity ${scorePct}`
      );
      console.log(
        `  ${DIM}to accept: confirm-match --org ${tenantId} --id ${item._id} --use-candidate --user-email <you>${RESET}`
      );
    } else {
      console.log(`  ${DIM}no candidate cleared the similarity floor -- this looks like a genuinely new ${item.kind}${RESET}`);
      console.log(
        `  ${DIM}to accept as new: confirm-new --org ${tenantId} --id ${item._id} --user-email <you>${RESET}`
      );
    }
    console.log(`  ${DIM}to reject: reject --org ${tenantId} --id ${item._id} --user-email <you> --reason "..."${RESET}`);
    console.log('');
  }
}

async function cmdConfirmMatch(tenantId: string) {
  const id = argValue('id');
  if (!id) {
    console.error('--id <reviewItemId> is required.');
    process.exit(1);
  }
  const userId = await resolveUserId();

  let entityId = argValue('entity');
  if (!entityId && hasFlag('use-candidate')) {
    const result = await transportCostQueryService.listNormalizationReviewQueue(tenantId, { page: 1, limit: 1000 });
    const item = result.data.find((r) => r._id === id);
    if (!item?.candidateEntityId) {
      console.error(`Review item ${id} has no suggested candidate to use -- pass --entity <id> explicitly, or use confirm-new instead.`);
      process.exit(1);
    }
    entityId = item.candidateEntityId;
  }
  if (!entityId) {
    console.error('Either --entity <resolvedEntityId> or --use-candidate is required.');
    process.exit(1);
  }

  const result = await transportCostCommandService.confirmReviewMatch(id, entityId, tenantId, userId);
  console.log(`${GREEN}Confirmed.${RESET} ${result.sourceRecordsUpdated} waiting source record(s) now resolve to ${entityId}.`);
}

async function cmdConfirmNew(tenantId: string) {
  const id = argValue('id');
  if (!id) {
    console.error('--id <reviewItemId> is required.');
    process.exit(1);
  }
  const userId = await resolveUserId();
  const businessStream = argValue('business-stream') as BusinessStream | undefined;

  const result = await transportCostCommandService.confirmReviewNew(id, tenantId, userId, undefined, businessStream);
  console.log(`${GREEN}Created.${RESET}`, JSON.stringify(result, null, 2));
}

async function cmdReject(tenantId: string) {
  const id = argValue('id');
  const reason = argValue('reason');
  if (!id) {
    console.error('--id <reviewItemId> is required.');
    process.exit(1);
  }
  if (!reason) {
    console.error('--reason "..." is required.');
    process.exit(1);
  }
  const userId = await resolveUserId();

  await transportCostCommandService.rejectReviewItem(id, tenantId, userId, reason);
  console.log(`${YELLOW}Rejected.${RESET} ${id} will not be normalized; its waiting source rows stay unresolved.`);
}

async function main(): Promise<void> {
  const subcommand = process.argv[2];
  const tenantId = argValue('org');

  if (!subcommand || !['list', 'confirm-match', 'confirm-new', 'reject'].includes(subcommand)) {
    console.error('Usage: npx tsx scripts/review-normalization-queue.ts <list|confirm-match|confirm-new|reject> --org <tenantId> ...');
    console.error('See this file\'s header comment for the full flag reference per subcommand.');
    process.exit(1);
  }
  if (!tenantId) {
    console.error('--org <tenantId> is required.');
    process.exit(1);
  }

  await connectToDatabase();
  bootstrapCqrs();

  switch (subcommand) {
    case 'list':
      await cmdList(tenantId);
      break;
    case 'confirm-match':
      await cmdConfirmMatch(tenantId);
      break;
    case 'confirm-new':
      await cmdConfirmNew(tenantId);
      break;
    case 'reject':
      await cmdReject(tenantId);
      break;
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
