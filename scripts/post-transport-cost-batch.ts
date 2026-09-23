// scripts/post-transport-cost-batch.ts
//
// Phase O3 -- posts already-imported (Phase O1) transport-cost source
// records into the Allocation Ledger, which is the only thing
// TransportCostReportService (Phase O4, the report page) actually
// reads. There is currently no button in the app for this: only a raw
// API route exists (POST /api/transport-cost/postings/batch, gated on
// Permission.FINANCE_MANAGE -- see that route file's own header). This
// script calls the exact same service the route does
// (transportCostPostingService.postImportBatch), so it is not a second,
// parallel posting path.
//
// SAFE TO RE-RUN. postImportBatch posts every source record in a batch
// individually and never throws for an expected condition -- a record
// still waiting on a Phase O2 normalization review decision comes back
// with a structured `skipped` outcome (reason: unresolved-vehicle-identity,
// pending-amount, etc.), not an error, and posting is itself idempotent
// (a re-run against an already-posted, unchanged row reports `unchanged`,
// never a duplicate ledger entry -- see transport-cost-posting.service.ts's
// own header). So you do not need to wait for every review item to be
// resolved before running this: run it now, see what posts and what's
// still blocked and why, resolve the blockers (bulk-confirm-new-review-items.ts
// and/or review-normalization-queue.ts), and run this again.
//
// WHY THIS NEEDS A REAL TenantContext, NOT systemWriteScope:
// transportCostPostingService.postImportBatch/postSourceRecord require a
// full TenantContext (org-unit scope included), unlike the O1 import
// command's WriteScope union. Rather than fabricate one, this script
// resolves the REAL one your account would get from an actual login --
// same TenantContextService.resolveContext(...) every controller calls,
// with the same real tbladmin.Role -> Role mapping login itself uses
// (resolveRole, exported from lib/authOptions.ts for exactly this reuse
// -- see that export's own comment). This is not a shortcut: it is the
// one correct way to post real financial data under a real user's real
// scope from a script that has no HTTP request to extract it from.
//
// Usage:
//   npx tsx scripts/post-transport-cost-batch.ts --org <tenantId> --user-email <email> --batch <importBatchId> [--batch <id2> ...]
//   npx tsx scripts/post-transport-cost-batch.ts --org <tenantId> --user-email <email> --all
//
// --all discovers every distinct importBatchId currently in
// tbltransportcostsourcerecords for this tenant and posts each in turn
// -- the simplest option right after an import, when you want
// everything that CAN post to post.

import 'dotenv/config';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function argValues(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length - 1; i++) {
    if (process.argv[i] === `--${name}`) out.push(process.argv[i + 1]);
  }
  return out;
}
function argValue(name: string): string | undefined {
  return argValues(name)[0];
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const tenantId = argValue('org');
  const userEmail = argValue('user-email');
  const explicitBatches = argValues('batch');
  const all = hasFlag('all');

  if (!tenantId) {
    console.error('--org <tenantId> is required.');
    process.exit(1);
  }
  if (!userEmail) {
    console.error('--user-email <email> is required -- this posts a real transport-cost record under this account\'s real, resolved permission scope.');
    process.exit(1);
  }
  if (!all && explicitBatches.length === 0) {
    console.error('Pass one or more --batch <importBatchId>, or --all to post every batch currently on file for this tenant.');
    process.exit(1);
  }

  const connectToDatabase = (await import('@/infrastructure/database/mongodb')).default;
  const { bootstrapCqrs } = await import('@/server/cqrs/cqrs.module');
  const { adminUserRepository } = await import('@/modules/organizations/repositories/admin-user.repository');
  const { tenantContextService } = await import('@/modules/tenancy/services/tenant-context.service');
  const { resolveRole } = await import('@/lib/authOptions');
  const { transportCostPostingService } = await import('@/modules/transport-cost/services/transport-cost-posting.service');
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

  // Mirrors lib/authOptions.ts's jwt() callback exactly: a real login
  // resolves one Role from tbladmin.Role and wraps it as the single-
  // element roles array (`customToken.roles = [resolvedRole]`) -- see
  // that file for why it is never a bare, unwrapped role.
  const role = resolveRole(account.Role);
  const context = await tenantContextService.resolveContext(
    userId,
    tenantId,
    [role],
    /* isPlatformAdmin */ false
  );

  console.log(`\n${BOLD}Posting as ${userEmail} (resolved role: ${role})${RESET}`);
  console.log(`Organization: ${context.organizationName} (${context.organizationId})`);
  console.log(`Org-unit scope: ${context.accessibleOrgUnitIds === null ? 'org-wide (unrestricted)' : `${context.accessibleOrgUnitIds.length} unit(s)`}\n`);

  let batchIds = explicitBatches;
  if (all) {
    // No repository `distinct` helper is exposed publicly (see
    // scripts/diagnose-transport-cost-duplicates.ts's own note on this) --
    // pull every record's importBatchId through the same public findMany
    // every other read in this codebase uses, capped well above what a
    // handful of source-file imports could ever produce.
    const records = await transportCostSourceRecordRepository.findMany({}, tenantId, { limit: 5000 });
    batchIds = Array.from(new Set(records.map((r) => r.importBatchId)));
    console.log(`${DIM}--all: found ${batchIds.length} distinct import batch(es) for this tenant.${RESET}\n`);
  }

  const totals: Record<string, number> = {
    posted: 0,
    unchanged: 0,
    corrected: 0,
    skipped: 0,
  };
  const skipReasons: Record<string, number> = {};

  for (const batchId of batchIds) {
    console.log(`${BOLD}Batch ${batchId}${RESET}`);
    const result = await transportCostPostingService.postImportBatch(context, userId, batchId);
    console.log(`  ${result.total} source record(s) in this batch`);

    for (const { outcome } of result.outcomes) {
      totals[outcome.status] = (totals[outcome.status] ?? 0) + 1;
      if (outcome.status === 'skipped') {
        skipReasons[outcome.reason] = (skipReasons[outcome.reason] ?? 0) + 1;
      }
    }

    const posted = result.outcomes.filter((o) => o.outcome.status === 'posted').length;
    const unchanged = result.outcomes.filter((o) => o.outcome.status === 'unchanged').length;
    const corrected = result.outcomes.filter((o) => o.outcome.status === 'corrected').length;
    const skipped = result.outcomes.filter((o) => o.outcome.status === 'skipped').length;
    console.log(
      `  ${GREEN}${posted} posted${RESET}, ${CYAN}${unchanged} unchanged${RESET}, ${CYAN}${corrected} corrected${RESET}, ${YELLOW}${skipped} skipped${RESET}\n`
    );
  }

  console.log(`${DIM}${'='.repeat(72)}${RESET}`);
  console.log(`${BOLD}Grand total across ${batchIds.length} batch(es)${RESET}`);
  console.log(`  ${GREEN}posted:${RESET}    ${totals.posted ?? 0}`);
  console.log(`  ${CYAN}unchanged:${RESET} ${totals.unchanged ?? 0}`);
  console.log(`  ${CYAN}corrected:${RESET} ${totals.corrected ?? 0}`);
  console.log(`  ${YELLOW}skipped:${RESET}   ${totals.skipped ?? 0}`);
  if (Object.keys(skipReasons).length > 0) {
    console.log(`\n  Skip reasons:`);
    for (const [reason, count] of Object.entries(skipReasons)) {
      console.log(`    ${YELLOW}${reason}${RESET}: ${count}`);
    }
    if (skipReasons['unresolved-vehicle-identity']) {
      console.log(`\n  ${YELLOW}unresolved-vehicle-identity means those rows' vehicle/transporter still has a pending${RESET}`);
      console.log(`  ${YELLOW}normalization review item -- run bulk-confirm-new-review-items.ts (or review-normalization-queue.ts${RESET}`);
      console.log(`  ${YELLOW}for anything with a suggested match), then re-run this script -- it is safe to re-run.${RESET}`);
    }
  }
  console.log(`${DIM}${'='.repeat(72)}${RESET}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
