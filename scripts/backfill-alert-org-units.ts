// scripts/backfill-alert-org-units.ts
//
// BACKLOG ITEM 2 -- gives historical tbltelematics_alerts rows the
// org unit they were always supposed to carry.
//
// ---------------------------------------------------------------------
// WHAT IS BEING REPAIRED
// ---------------------------------------------------------------------
// `telematicsRepository.createAlert` wrote no `orgUnitId` while
// `getActiveAlertsInScope` filters on one, so every alert raised before
// that fix is invisible to every org-unit-scoped reader. The value is
// MISSING, not wrong -- which makes this a fill, not a correction, and
// is why it is a different shape of migration from
// backfill-attention-item-ownership.ts (that one recomputes rows whose
// stored value was present and wrong).
//
// ---------------------------------------------------------------------
// WHY THIS IS ITS OWN SCRIPT RATHER THAN `tenancy:backfill`
// ---------------------------------------------------------------------
// `scripts/backfill-org-units.ts` joins on `license_plate`, which is
// how every other vehicle-derived collection identifies its vehicle.
// tbltelematics_alerts does not have one: it stores `vehicleId`, the
// vehicle's Mongo _id. Teaching the generic tool a second join shape
// for one collection would make it harder to audit than a small
// purpose-built script whose one join is visible in full.
//
// The `_id` join is also the part that needs care, and is the reason
// this is not a two-line `updateMany` with a `$lookup`: `vehicleId` is
// stored as a STRING while `tblvehicles._id` is an ObjectId. A join
// that compares them directly matches nothing and reports a clean
// "0 rows updated" -- the failure mode this codebase has hit before
// (see scripts/lib/tenant-identity.ts on slug-vs-ObjectId). Both forms
// are tried explicitly here.
//
// ---------------------------------------------------------------------
// WHAT CANNOT BE BACKFILLED, AND WHY THAT IS REPORTED NOT GUESSED
// ---------------------------------------------------------------------
// Three cases resolve to nothing, and all three are counted and shown
// rather than filled:
//
//   * the referenced vehicle no longer exists (hard-deleted, or the
//     alert predates a data repair);
//   * the vehicle exists but has no orgUnitId of its own -- an
//     unassigned vehicle. Assigning the alert would mean inventing an
//     owner for the vehicle, which is an operator decision
//     (`npm run tenancy:report` lists them);
//   * the alert row has no `vehicleId` at all.
//
// A guessed owner in this collection is worse than an invisible row:
// an alert is a claim about a named vehicle's behaviour, and filing it
// with the wrong branch shows one branch another branch's driving.
//
// ---------------------------------------------------------------------
// SAFETY
// ---------------------------------------------------------------------
//   * DRY RUN BY DEFAULT. --confirm to write.
//   * NEVER overwrites a row that already has an orgUnitId. A row
//     written since the fix already carries an authoritative value.
//   * Every write is recorded to tbltenant_repair_audit in the shape
//     the other repair tools use, so `--revert <runId>` can undo
//     exactly this run's changes and nothing else.
//
// Usage:
//   npx tsx scripts/backfill-alert-org-units.ts                    # dry run, all tenants
//   npx tsx scripts/backfill-alert-org-units.ts --confirm          # commit
//   npx tsx scripts/backfill-alert-org-units.ts --org <slug>       # one tenant
//   npx tsx scripts/backfill-alert-org-units.ts --revert <runId>   # dry-run a revert
//   npx tsx scripts/backfill-alert-org-units.ts --revert <runId> --confirm

/* eslint-disable no-console */

import { MongoClient, Db, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import { randomBytes } from 'crypto';

dotenv.config();

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
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
const ALERTS_COLLECTION = 'tbltelematics_alerts';
const SCRIPT_NAME = 'backfill-alert-org-units';

interface TenantSummary {
  tenantId: string;
  name: string;
  scanned: number;
  filled: number;
  alreadySet: number;
  vehicleMissing: number;
  vehicleUnassigned: number;
  noVehicleId: number;
}

/**
 * Vehicle _id -> orgUnitId for one tenant, keyed by BOTH the ObjectId
 * hex string and (where the row stores one) any string form, so the
 * lookup works whichever way `vehicleId` was written.
 */
async function buildVehicleOrgUnitMap(db: Db, tenantId: string): Promise<Map<string, string | null>> {
  const vehicles = await db
    .collection('tblvehicles')
    .find({ tenantId }, { projection: { _id: 1, orgUnitId: 1 } })
    .toArray();

  const map = new Map<string, string | null>();
  for (const vehicle of vehicles) {
    const orgUnitId =
      typeof vehicle.orgUnitId === 'string' && vehicle.orgUnitId.trim()
        ? vehicle.orgUnitId
        : vehicle.orgUnitId instanceof ObjectId
          ? String(vehicle.orgUnitId)
          : null;
    map.set(String(vehicle._id), orgUnitId);
  }
  return map;
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
  console.log(`${BOLD}Telematics alert org-unit backfill${RESET}   ${DIM}run ${RUN_ID}${RESET}`);
  console.log(`${DIM}${'='.repeat(74)}${RESET}`);
  console.log(`  Mode: ${APPLY ? `${GREEN}APPLY${RESET}` : `${YELLOW}DRY RUN (no writes)${RESET}`}`);
  console.log('');

  const alerts = db.collection(ALERTS_COLLECTION);
  const audit = db.collection(AUDIT_COLLECTION);

  const summaries: TenantSummary[] = [];

  for (const target of targets) {
    const vehicleOrgUnits = await buildVehicleOrgUnitMap(db, target.tenantId);

    const summary: TenantSummary = {
      tenantId: target.tenantId,
      name: target.name,
      scanned: 0,
      filled: 0,
      alreadySet: 0,
      vehicleMissing: 0,
      vehicleUnassigned: 0,
      noVehicleId: 0,
    };

    const cursor = alerts.find({ tenantId: target.tenantId });

    for await (const row of cursor) {
      summary.scanned += 1;

      const existing =
        typeof row.orgUnitId === 'string' && row.orgUnitId.trim() ? row.orgUnitId : null;
      if (existing) {
        // Written after the fix, or by upsertVendorAlerts, which has
        // always stamped one. Authoritative; never overwritten.
        summary.alreadySet += 1;
        continue;
      }

      const vehicleId =
        typeof row.vehicleId === 'string'
          ? row.vehicleId
          : row.vehicleId instanceof ObjectId
            ? String(row.vehicleId)
            : null;

      if (!vehicleId) {
        summary.noVehicleId += 1;
        continue;
      }

      if (!vehicleOrgUnits.has(vehicleId)) {
        summary.vehicleMissing += 1;
        continue;
      }

      const orgUnitId = vehicleOrgUnits.get(vehicleId) ?? null;
      if (!orgUnitId) {
        summary.vehicleUnassigned += 1;
        continue;
      }

      if (APPLY) {
        await alerts.updateOne(
          { _id: row._id },
          { $set: { orgUnitId, orgUnitResolution: 'vehicle', updatedAt: new Date() } }
        );
        await audit.insertOne({
          runId: RUN_ID,
          script: SCRIPT_NAME,
          collection: ALERTS_COLLECTION,
          documentId: String(row._id),
          field: 'orgUnitId',
          previousValue: null,
          newValue: orgUnitId,
          ladder: 'alert-vehicle-join',
          at: new Date(),
        } as never);
      }
      summary.filled += 1;
    }

    if (summary.scanned > 0) summaries.push(summary);
  }

  let totalFilled = 0;
  let totalUnfillable = 0;

  for (const s of summaries) {
    const verb = APPLY ? 'filled' : 'would fill';
    const unfillable = s.vehicleMissing + s.vehicleUnassigned + s.noVehicleId;
    totalFilled += s.filled;
    totalUnfillable += unfillable;

    console.log(`${BOLD}${s.name}${RESET} ${DIM}(${s.tenantId})${RESET}`);
    console.log(
      `    ${s.scanned} scanned, ${GREEN}${s.filled} ${verb}${RESET}, ` +
        `${s.alreadySet} already set` +
        (unfillable > 0 ? `, ${YELLOW}${unfillable} unfillable${RESET}` : '')
    );
    if (unfillable > 0) {
      console.log(
        `${DIM}      vehicle not found: ${s.vehicleMissing} · ` +
          `vehicle has no org unit: ${s.vehicleUnassigned} · ` +
          `alert has no vehicleId: ${s.noVehicleId}${RESET}`
      );
    }
    console.log('');
  }

  console.log(`${DIM}${'-'.repeat(74)}${RESET}`);
  console.log(
    `  ${BOLD}${totalFilled}${RESET} row(s) ${APPLY ? 'updated' : 'would be updated'}; ` +
      `${BOLD}${totalUnfillable}${RESET} left unset (reported above, never guessed).`
  );
  if (!APPLY && totalFilled > 0) {
    console.log(`  Re-run with ${BOLD}--confirm${RESET} to write. Revert with --revert ${RUN_ID}.`);
  }
  if (APPLY && totalFilled > 0) {
    console.log(`  Revert this run with: npx tsx scripts/${SCRIPT_NAME}.ts --revert ${RUN_ID} --confirm`);
  }
  console.log('');
}

/**
 * Restores exactly the rows this script's own run changed.
 *
 * Skips (never clobbers) a row whose current value no longer matches
 * what the run wrote -- something else has touched it since, and
 * reverting would then be a second unaudited change rather than an undo.
 */
async function runRevert(db: Db, runId: string): Promise<void> {
  const audit = db.collection(AUDIT_COLLECTION);
  const alerts = db.collection(ALERTS_COLLECTION);

  const entries = await audit
    .find({ runId, script: SCRIPT_NAME, collection: ALERTS_COLLECTION })
    .toArray();

  if (entries.length === 0) {
    console.log(`${YELLOW}No audit entries for run ${runId}.${RESET}`);
    return;
  }

  console.log('');
  console.log(`${BOLD}Reverting run ${runId}${RESET} (${entries.length} entries)`);
  console.log(`  Mode: ${APPLY ? `${GREEN}APPLY${RESET}` : `${YELLOW}DRY RUN${RESET}`}`);

  let reverted = 0;
  let skipped = 0;

  for (const entry of entries) {
    const row = await alerts.findOne({ _id: new ObjectId(String(entry.documentId)) });
    if (!row) {
      skipped += 1;
      continue;
    }
    if (row.orgUnitId !== entry.newValue) {
      skipped += 1;
      continue;
    }
    if (APPLY) {
      await alerts.updateOne(
        { _id: row._id },
        { $unset: { orgUnitId: '', orgUnitResolution: '' }, $set: { updatedAt: new Date() } }
      );
    }
    reverted += 1;
  }

  console.log(
    `  ${GREEN}${reverted}${RESET} ${APPLY ? 'reverted' : 'would revert'}, ` +
      `${YELLOW}${skipped}${RESET} skipped (changed since, or row gone).`
  );
  console.log('');
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`${RED}MONGODB_URI is not set.${RESET}`);
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db();
    if (REVERT_RUN_ID) {
      await runRevert(db, REVERT_RUN_ID);
    } else {
      await runBackfill(db);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`${RED}${(error as Error).message}${RESET}`);
  process.exit(1);
});
