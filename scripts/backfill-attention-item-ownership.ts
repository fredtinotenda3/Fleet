// scripts/backfill-attention-item-ownership.ts
//
// PHASE 0 -- Database/Migration Safety. Corrects historically-
// contaminated `orgUnitId` values on existing tblattentionitems rows,
// written before the Phase 0 ownership fix
// (modules/attention/services/attention-ownership.resolver.ts).
//
// ---------------------------------------------------------------------
// Why this is a DIFFERENT shape of migration than scripts/backfill-org-units.ts
// ---------------------------------------------------------------------
// backfill-org-units.ts only ever fills a MISSING orgUnitId -- by
// design, it never touches a row that already has one, because for
// every OTHER 'org-unit' module a present value is trustworthy (it was
// set correctly at write time; the only failure mode was "never set at
// all").
//
// tblattentionitems is different. Before this pass,
// needsAttentionService.persistFeed() set `orgUnitId` on EVERY row to
// the CALLER's active org unit (`context?.activeOrgUnitId`), not the
// item's own true owner -- so a historical row's orgUnitId is not
// "missing", it is PRESENT AND POTENTIALLY WRONG (a Bulawayo vehicle's
// item stamped with orgUnitId: Harare, if a Harare-scoped user happened
// to be the one whose dashboard load produced it). Filling-only-if-
// missing would silently leave every one of those contaminated rows
// exactly as wrong as it already was. This script instead RECOMPUTES
// every row's target orgUnitId from data the row itself stores
// (`source` + `entityId` + `entityLabel`) using the exact same
// AttentionOwnershipResolver the live code now uses, and writes only
// when the recomputed value DIFFERS from what is currently stored --
// which is what makes repeated runs idempotent (a second run recomputes
// the same target, finds no diff, writes nothing).
//
// ---------------------------------------------------------------------
// Why tblanomalies is NOT covered by this script
// ---------------------------------------------------------------------
// Anomaly's equivalent bug (see
// modules/intelligence/services/ANOMALY_VS_ATTENTIONITEM.md) was a pure
// omission -- `persistBatch()` never included `orgUnitId` in the
// created document AT ALL, so every historical row has it MISSING, not
// wrong. That is exactly the case scripts/backfill-org-units.ts already
// handles correctly (it is registered with `orgUnitSource: 'vehicle'`
// and joins on `licensePlate`, which Anomaly carries). Run
// `npm run tenancy:backfill -- --collections tblanomalies` for that;
// writing a second, overlapping tool for the same job would violate
// the "reuse existing patterns, don't invent a second migration
// mechanism" instruction this pass is under.
//
// ---------------------------------------------------------------------
// Reconstructing a target from a persisted row
// ---------------------------------------------------------------------
// A persisted AttentionItem does not store the full context the LIVE
// per-source readers had (e.g. compliance's `entityType`, or a vehicle
// Mongo _id for maintenance items -- those only ever stored
// `entityLabel`, a license plate). Two resolver target kinds exist
// SPECIFICALLY for this reconstruction --
// 'vehicle-by-plate' and 'vehicle-or-driver' -- see
// attention-ownership.resolver.ts for why they are safe (fail closed,
// never guess between two possible matches).
//
// ---------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------
//   * DRY RUN BY DEFAULT. --confirm to write.
//   * Only writes a row when the recomputed orgUnitId differs from the
//     currently-stored one (including unset -> resolved, and resolved
//     -> a DIFFERENT org unit -- both are "this row was wrong").
//   * Every write is recorded to tbltenant_repair_audit in the same
//     shape scripts/backfill-org-units.ts uses (field/previousValue/
//     newValue/ladder/at/runId/script/collection/documentId), for
//     forensic continuity with that tool's own audit trail.
//   * --revert <runId> reverts exactly the rows this script's own run
//     changed, restoring `previousValue`, and ONLY if the row's current
//     value still matches what this run wrote (skipped, not clobbered,
//     if something else changed it since). Self-contained: it does not
//     depend on scripts/revert-tenant-run.ts, which is hardcoded to
//     `tenantId` reverts and is not a fit for an `orgUnitId` run (a
//     pre-existing narrowness in that tool, unrelated to this pass --
//     flagged in the Phase 0 report's remaining-gaps section rather
//     than silently worked around).
//
// Usage:
//   npx tsx scripts/backfill-attention-item-ownership.ts                       # dry run, all tenants
//   npx tsx scripts/backfill-attention-item-ownership.ts --confirm             # commit
//   npx tsx scripts/backfill-attention-item-ownership.ts --org <slug>          # one tenant
//   npx tsx scripts/backfill-attention-item-ownership.ts --revert <runId>              # dry-run a revert
//   npx tsx scripts/backfill-attention-item-ownership.ts --revert <runId> --confirm     # commit the revert

/* eslint-disable no-console */

import { MongoClient, Db, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { attentionOwnershipResolver, AttentionOwnerTarget } from '../modules/attention/services/attention-ownership.resolver';
import { toObjectIdOrNull } from './lib/tenant-identity';

dotenv.config();

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const argv = process.argv.slice(2);

function optionValue(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) {
    console.error(`${RED}--${name} requires a value.${RESET}`);
    process.exit(1);
  }
  return next;
}

const APPLY = argv.includes('--confirm');
const ORG_ARG = optionValue('org');
const REVERT_RUN_ID = optionValue('revert');
const RUN_ID = randomBytes(12).toString('hex');
const AUDIT_COLLECTION = 'tbltenant_repair_audit';
const SCRIPT_NAME = 'backfill-attention-item-ownership';

/**
 * Rebuilds the AttentionOwnerTarget a persisted row's `source` implies,
 * from the fields the row itself stores. Mirrors (does not duplicate
 * the RESOLUTION logic of, only the DISPATCH-BY-SOURCE shape of)
 * needs-attention.service.ts's per-source readers.
 */
export function reconstructTarget(row: {
  source?: string;
  entityId?: string | null;
  entityLabel?: string | null;
}): AttentionOwnerTarget {
  switch (row.source) {
    case 'predictive_maintenance':
    case 'fuel_fraud':
      return { kind: 'vehicle', vehicleId: row.entityId ?? undefined };
    case 'driver_risk':
      return { kind: 'organization-member', userId: row.entityId ?? undefined };
    case 'expense_anomaly':
      return { kind: 'expense', expenseId: row.entityId ?? undefined };
    case 'compliance':
      // Persisted rows don't carry entityType (vehicle vs driver) --
      // see attention-item.types.ts. Try both, never guess.
      return { kind: 'vehicle-or-driver', id: row.entityId ?? undefined };
    case 'maintenance':
      // Persisted rows never had entityId set for this source -- only
      // entityLabel (a license plate). See needs-attention.service.ts's
      // readMaintenance().
      return { kind: 'vehicle-by-plate', licensePlate: row.entityLabel ?? undefined };
    case 'fleet_health':
    default:
      return { kind: 'none' };
  }
}

async function runBackfill(db: Db): Promise<void> {
  const orgs = await db
    .collection('tblorganizations')
    .find({ isDeleted: { $ne: true } })
    .toArray();

  const targets = orgs
    .map((o) => ({
      tenantId:
        (typeof o.tenantId === 'string' && o.tenantId.trim()) ||
        (typeof o.slug === 'string' && o.slug.trim()) ||
        String(o._id),
      name: String(o.name ?? ''),
    }))
    .filter((o) => (ORG_ARG ? o.tenantId === ORG_ARG : true));

  if (targets.length === 0) {
    throw new Error(ORG_ARG ? `No organization matches "${ORG_ARG}".` : 'No organizations found.');
  }

  console.log('');
  console.log(`${BOLD}AttentionItem ownership correction${RESET}   ${DIM}run ${RUN_ID}${RESET}`);
  console.log(`${DIM}${'='.repeat(74)}${RESET}`);
  console.log(`  Mode: ${APPLY ? `${GREEN}APPLY${RESET}` : `${YELLOW}DRY RUN (no writes)${RESET}`}`);
  console.log('');

  const collection = db.collection('tblattentionitems');
  const audit = db.collection(AUDIT_COLLECTION);

  let totalScanned = 0;
  let totalCorrected = 0;
  let totalAlreadyCorrect = 0;
  let totalUnresolved = 0;

  for (const target of targets) {
    const rows = await collection.find({ tenantId: target.tenantId, isDeleted: { $ne: true } }).toArray();
    if (rows.length === 0) continue;

    let corrected = 0;
    let alreadyCorrect = 0;
    let unresolved = 0;
    const sampleCorrections: string[] = [];

    for (const row of rows) {
      totalScanned += 1;
      const target2 = reconstructTarget(row as any);
      const resolved = await attentionOwnershipResolver.resolveOrgUnitId(target.tenantId, target2);
      const current = typeof row.orgUnitId === 'string' && row.orgUnitId ? row.orgUnitId : null;

      if (resolved === current) {
        alreadyCorrect += 1;
        continue;
      }

      if (resolved === null) {
        // Recomputation could not determine an owner (e.g. the source
        // no longer resolves to a live entity). Fail closed: never
        // clear a currently-set value just because we can no longer
        // re-derive it independently -- that would trade a possibly-
        // wrong value for a definitely-unknown one, which is not an
        // improvement. Reported as unresolved for operator visibility,
        // not written.
        unresolved += 1;
        continue;
      }

      if (sampleCorrections.length < 5) {
        sampleCorrections.push(`${row.itemKey} (${row.source}): ${current ?? '(unset)'} -> ${resolved}`);
      }

      if (APPLY) {
        await collection.updateOne(
          { _id: row._id },
          { $set: { orgUnitId: resolved, updatedAt: new Date() } }
        );
        await audit.insertOne({
          runId: RUN_ID,
          script: SCRIPT_NAME,
          collection: 'tblattentionitems',
          documentId: String(row._id),
          field: 'orgUnitId',
          previousValue: current,
          newValue: resolved,
          ladder: 'attention-ownership-resolver',
          at: new Date(),
        } as never);
      }
      corrected += 1;
    }

    totalCorrected += corrected;
    totalAlreadyCorrect += alreadyCorrect;
    totalUnresolved += unresolved;

    if (corrected > 0 || unresolved > 0) {
      const verb = APPLY ? 'corrected' : 'would correct';
      console.log(`${BOLD}${target.name}${RESET} ${DIM}(${target.tenantId})${RESET}`);
      console.log(
        `    ${rows.length} rows scanned, ${GREEN}${corrected} ${verb}${RESET}, ` +
          `${alreadyCorrect} already correct` +
          (unresolved > 0 ? `, ${YELLOW}${unresolved} unresolved${RESET}` : '')
      );
      for (const sample of sampleCorrections) {
        console.log(`      ${DIM}${sample}${RESET}`);
      }
      console.log('');
    }
  }

  console.log(`${BOLD}${'='.repeat(74)}${RESET}`);
  console.log(`  Scanned:          ${totalScanned}`);
  console.log(`  ${APPLY ? 'Corrected' : 'Would correct'}:      ${GREEN}${totalCorrected}${RESET}`);
  console.log(`  Already correct:  ${totalAlreadyCorrect}`);
  console.log(`  Unresolved:       ${totalUnresolved > 0 ? YELLOW : DIM}${totalUnresolved}${RESET}`);
  console.log('');

  if (!APPLY) {
    console.log(`${YELLOW}Dry run. Nothing was written.${RESET}`);
    console.log(`Re-run with ${BOLD}--confirm${RESET} to apply.`);
  } else {
    console.log(`${GREEN}Correction applied.${RESET} Run id ${CYAN}${RUN_ID}${RESET}`);
    console.log(`${DIM}Roll back with: npx tsx scripts/backfill-attention-item-ownership.ts --revert ${RUN_ID} --confirm${RESET}`);
  }
  console.log('');
}

async function runRevert(db: Db, runId: string): Promise<void> {
  const audit = db.collection(AUDIT_COLLECTION);
  const entries = await audit.find({ runId, script: SCRIPT_NAME }).toArray();

  console.log('');
  console.log(`${BOLD}Reverting run ${runId}${RESET}`);
  console.log(`${DIM}${'='.repeat(74)}${RESET}`);

  if (entries.length === 0) {
    console.log(`  No audit entries found for that run id.`);
    return;
  }

  const collection = db.collection('tblattentionitems');
  const revertable: typeof entries = [];
  const changedSince: typeof entries = [];

  for (const e of entries) {
    const oid = toObjectIdOrNull(String(e.documentId));
    if (!oid) continue;
    const current = await collection.findOne({ _id: oid });
    if (!current) continue;
    const currentValue = typeof current.orgUnitId === 'string' && current.orgUnitId ? current.orgUnitId : null;
    if (currentValue === e.newValue) revertable.push(e);
    else changedSince.push(e);
  }

  console.log(`  revertable ......................... ${revertable.length}`);
  console.log(`  changed since the run (skipped) .... ${changedSince.length}`);
  console.log('');

  if (!APPLY) {
    console.log(`${YELLOW}Dry run. Nothing was written.${RESET} Re-run with --confirm to apply.`);
    return;
  }

  const revertRunId = randomBytes(12).toString('hex');
  let reverted = 0;
  for (const e of revertable) {
    const oid = toObjectIdOrNull(String(e.documentId));
    if (!oid) continue;

    const update =
      e.previousValue === null || e.previousValue === undefined
        ? { $unset: { orgUnitId: '' as const }, $set: { updatedAt: new Date() } }
        : { $set: { orgUnitId: e.previousValue, updatedAt: new Date() } };

    const res = await collection.updateOne({ _id: oid, orgUnitId: e.newValue }, update as never);
    if (res.modifiedCount) {
      reverted += 1;
      await audit.insertOne({
        runId: revertRunId,
        revertOf: runId,
        script: SCRIPT_NAME,
        collection: 'tblattentionitems',
        documentId: e.documentId,
        field: 'orgUnitId',
        previousValue: e.newValue,
        newValue: e.previousValue ?? null,
        ladder: 'REVERT',
        at: new Date(),
      } as never);
    }
  }

  console.log(`${GREEN}Reverted: ${reverted} document(s).${RESET}`);
  console.log(`  This revert is itself audited as runId "${revertRunId}".`);
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`${RED}MONGODB_URI is not set.${RESET}`);
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  try {
    if (REVERT_RUN_ID) {
      await runRevert(db, REVERT_RUN_ID);
    } else {
      await runBackfill(db);
    }
  } finally {
    await client.close();
  }
}

// Guarded so importing `reconstructTarget` for a unit test (see
// tests/security/attention-item-backfill.spec.ts) does not also try to
// connect to MongoDB via `main()`.
if (require.main === module) {
  main().catch((error) => {
    console.error('');
    console.error(`${RED}Failed:${RESET}`, error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
