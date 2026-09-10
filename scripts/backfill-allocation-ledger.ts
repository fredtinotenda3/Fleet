// scripts/backfill-allocation-ledger.ts
//
// Posts HISTORICAL fuel, expense, maintenance and work-order records
// into the allocation ledger.
//
// ---------------------------------------------------------------------
// WHY THIS IS NEEDED
// ---------------------------------------------------------------------
// The posting handler was keyed on two event names that do not exist
// (`FuelLogCreated` and `MaintenanceCompleted`; the real names are
// `FuelLogged` and `ReminderCompleted`), so the ledger received EXPENSES
// ONLY. Fuel -- the largest operating cost in almost any fleet -- never
// posted, and neither did maintenance. Cost-per-km divided a real
// distance by a total missing most of its numerator.
//
// New records post automatically now. Historical ones do not, because
// replaying them would mean re-emitting their creation events and the
// outbox is a delivery log, not a replay log. This script posts them
// directly, through the same service and the same rules.
//
// ---------------------------------------------------------------------
// WHY IT CANNOT DOUBLE-POST
// ---------------------------------------------------------------------
// Not by being careful -- by construction. `allocationPostingService`
// derives a deterministic idempotency key from
// (tenantId, sourceCollection, sourceId, costCategory) and a PARTIAL
// UNIQUE INDEX enforces it. A record already in the ledger returns
// `duplicate` and writes nothing, whether it got there from an event, an
// earlier run of this script, or a run that died halfway.
//
// That is the property that makes this safe to re-run, and it is why the
// script does not keep its own "already done" state: a checkpoint file
// can be lost or stale, an index cannot.
//
//   >>> RUN `npm run db:indexes` FIRST. Without the partial unique index
//   >>> the guarantee is application-level only, and two concurrent runs
//   >>> could each pass the read-before-write.
//
// ---------------------------------------------------------------------
// WHAT IT WILL NOT DO
// ---------------------------------------------------------------------
//   * It will not date a posting to now. A record with no date is
//     REFUSED and reported. On an append-only ledger a cost in the wrong
//     period cannot be edited out.
//   * It will not convert a foreign currency at an assumed 1:1. There is
//     no FX feed in this platform; a rate-less foreign amount is refused
//     downstream and counted here.
//   * It will not edit or delete anything. The ledger is append-only; a
//     wrong posting is corrected by a reversing entry made by a human.
//   * It will not decide WHICH PERIODS to post. Which months are already
//     closed in the customer's own general ledger is a finance decision,
//     not an engineering one -- so `--from` / `--to` are the operator's
//     to set, and the default is "everything", stated loudly.
//
// Usage:
//   npm run finance:backfill-ledger -- --tenant <slug>                      # dry run
//   npm run finance:backfill-ledger -- --tenant <slug> --confirm            # post
//   npm run finance:backfill-ledger -- --tenant <slug> --from 2026-01-01 --to 2026-06-30
//   npm run finance:backfill-ledger -- --tenant <slug> --sources fuel,expenses

import { MongoClient, Db } from 'mongodb';
import * as dotenv from 'dotenv';

import {
  buildAllocationSources,
  type PostingSpec,
} from '../modules/finance/services/allocation-source-builder';
import { allocationPostingService } from '../modules/finance/services/allocation-posting.service';
import type { TenantContext } from '../modules/tenancy/services/tenant-context.service';

dotenv.config();

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// ─────────────────────────────────────────────────────────────────────
// What can be backfilled, and the filter that says which rows qualify
// ─────────────────────────────────────────────────────────────────────

interface SourceDefinition {
  key: string;
  collection: string;
  spec: PostingSpec;
  /**
   * Extra match applied on top of the tenant filter.
   *
   * This is the part worth reading. A reminder that has not been
   * completed has incurred no cost yet; posting its estimate would put a
   * cost in the ledger for work nobody has done. Same for a work order
   * that is still open.
   */
  filter: Record<string, unknown>;
  /** Which field carries the date, for the period window. */
  dateField: string;
  note: string;
}

const SOURCES: SourceDefinition[] = [
  {
    key: 'fuel',
    collection: 'tblfuellogs',
    spec: { sourceCollection: 'tblfuellogs', costCategory: 'fuel' },
    filter: {},
    dateField: 'date',
    note: 'Every fuel log is a cost the moment it is recorded.',
  },
  {
    key: 'expenses',
    collection: 'tblexpenses',
    spec: { sourceCollection: 'tblexpenses', costCategory: 'expense' },
    filter: {},
    dateField: 'date',
    note: 'Expenses already posted via events; included so a re-run reconciles them too.',
  },
  {
    key: 'maintenance',
    collection: 'tblreminders',
    spec: { sourceCollection: 'tblreminders', costCategory: 'maintenance' },
    filter: { status: 'completed' },
    dateField: 'completion_date',
    note: 'COMPLETED reminders only — an outstanding reminder has incurred no cost yet.',
  },
  {
    key: 'workorders',
    collection: 'tblworkorders',
    spec: { sourceCollection: 'tblworkorders', costCategory: 'maintenance' },
    filter: { status: 'completed' },
    dateField: 'completedAt',
    note: 'COMPLETED work orders only. Parts and labour post as separate lines.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// Arguments
// ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const CONFIRM = argv.includes('--confirm');
const ALL_TENANTS = argv.includes('--yes-all-tenants');

function argValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const TENANT = argValue('--tenant');
const FROM = argValue('--from');
const TO = argValue('--to');
const ONLY = argValue('--sources')
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function parseBoundary(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    console.error(`${RED}--${label} is not a date I can read: "${value}"${RESET}`);
    process.exit(1);
  }
  return parsed;
}

const FROM_DATE = parseBoundary(FROM, 'from');
const TO_DATE = parseBoundary(TO, 'to');

if (ONLY) {
  const known = new Set(SOURCES.map((s) => s.key));
  const unknown = ONLY.filter((k) => !known.has(k));
  if (unknown.length > 0) {
    console.error(
      `${RED}Unknown --sources: ${unknown.join(', ')}. ` +
        `Known: ${[...known].join(', ')}.${RESET}`
    );
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────

interface SourceOutcome {
  key: string;
  collection: string;
  examined: number;
  posted: number;
  duplicate: number;
  refused: number;
  /** Capped: a report nobody can read is a report nobody reads. */
  refusals: Array<{ sourceId: string; reason: string }>;
}

const MAX_REPORTED_REFUSALS = 20;

/**
 * The context postings are made under.
 *
 * Organization-wide by necessity -- a script has no acting user. This
 * does NOT widen org-unit isolation: the posting's own `orgUnitId` is
 * derived by allocationService from the resolved VEHICLE, exactly as it
 * is for a human-initiated posting, and this context has no field in
 * which to express one.
 */
function scriptContext(tenantId: string): TenantContext {
  return {
    organizationId: tenantId,
    organizationName: '',
    accessibleOrgUnitIds: null,
    assignedOrgUnitIds: [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

/** license_plate -> vehicle _id, built once per tenant. */
async function buildPlateIndex(db: Db, tenantId: string): Promise<Map<string, string[]>> {
  const vehicles = await db
    .collection('tblvehicles')
    .find({ tenantId, isDeleted: { $ne: true } }, { projection: { license_plate: 1 } })
    .toArray();

  const index = new Map<string, string[]>();
  for (const vehicle of vehicles) {
    const plate = String(vehicle.license_plate ?? '').trim().toUpperCase();
    if (!plate) continue;
    const ids = index.get(plate) ?? [];
    ids.push(String(vehicle._id));
    index.set(plate, ids);
  }
  return index;
}

async function backfillTenant(db: Db, tenantId: string): Promise<SourceOutcome[]> {
  const context = scriptContext(tenantId);
  const plateIndex = await buildPlateIndex(db, tenantId);
  const outcomes: SourceOutcome[] = [];

  for (const definition of SOURCES) {
    if (ONLY && !ONLY.includes(definition.key)) continue;

    const outcome: SourceOutcome = {
      key: definition.key,
      collection: definition.collection,
      examined: 0,
      posted: 0,
      duplicate: 0,
      refused: 0,
      refusals: [],
    };

    const dateFilter: Record<string, unknown> = {};
    if (FROM_DATE) dateFilter.$gte = FROM_DATE;
    if (TO_DATE) dateFilter.$lte = TO_DATE;

    const query: Record<string, unknown> = {
      tenantId,
      isDeleted: { $ne: true },
      ...definition.filter,
      ...(Object.keys(dateFilter).length > 0 ? { [definition.dateField]: dateFilter } : {}),
    };

    const cursor = db.collection(definition.collection).find(query);

    // Streamed, not loaded: a busy fleet's fuel history is the largest
    // collection after telemetry, and this must run on a worker with a
    // few hundred MB rather than the whole table in memory.
    for await (const record of cursor) {
      outcome.examined += 1;

      const plate = String(record.license_plate ?? '').trim().toUpperCase();
      const matches = plateIndex.get(plate) ?? [];

      if (matches.length === 0) {
        outcome.refused += 1;
        pushRefusal(outcome, String(record._id), `No active vehicle matches plate "${plate || '(blank)'}".`);
        continue;
      }
      if (matches.length > 1) {
        // NEVER GUESSES. Two active vehicles sharing a plate is real in
        // this deployment (two organizations are both named "Toyota
        // Zimbabwe"), and picking the first would file a cost against the
        // wrong truck, in a ledger that cannot be edited.
        outcome.refused += 1;
        pushRefusal(
          outcome,
          String(record._id),
          `Plate "${plate}" matches ${matches.length} active vehicles. Resolve the duplicate first.`
        );
        continue;
      }

      const { sources, refusal } = buildAllocationSources({
        spec: definition.spec,
        sourceId: String(record._id),
        vehicleId: matches[0],
        record: record as Record<string, unknown>,
      });

      if (refusal) {
        outcome.refused += 1;
        pushRefusal(outcome, String(record._id), refusal);
        continue;
      }

      for (const source of sources) {
        if (!CONFIRM) {
          // A dry run must not write, and must not LIE about what a real
          // run would do either. It cannot know whether a posting already
          // exists without reading the ledger, so it reports what it
          // would ATTEMPT and says so in the summary.
          outcome.posted += 1;
          continue;
        }

        const result = await allocationPostingService.postSource(context, 'system', source);
        if (result.status === 'posted') outcome.posted += 1;
        else if (result.status === 'duplicate') outcome.duplicate += 1;
        else {
          outcome.refused += 1;
          pushRefusal(outcome, source.sourceId, result.reason);
        }
      }
    }

    outcomes.push(outcome);
  }

  return outcomes;
}

function pushRefusal(outcome: SourceOutcome, sourceId: string, reason: string) {
  if (outcome.refusals.length < MAX_REPORTED_REFUSALS) {
    outcome.refusals.push({ sourceId, reason });
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`${RED}MONGODB_URI is not set.${RESET}`);
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  try {
    const tenants = await resolveTenants(db);

    console.log(`\n${BOLD}Allocation ledger backfill${RESET}`);
    console.log(`${DIM}Mode:      ${CONFIRM ? `${RED}APPLY${RESET}${DIM}` : `${GREEN}DRY RUN${RESET}${DIM}`}${RESET}`);
    console.log(`${DIM}Tenants:   ${tenants.join(', ')}${RESET}`);
    console.log(
      `${DIM}Period:    ${FROM_DATE ? FROM_DATE.toISOString().slice(0, 10) : '(no lower bound)'} ` +
        `to ${TO_DATE ? TO_DATE.toISOString().slice(0, 10) : '(no upper bound)'}${RESET}`
    );
    if (!FROM_DATE && !TO_DATE) {
      console.log(
        `${YELLOW}           No period bounds given, so EVERY historical record will be considered.\n` +
          `           Which months are already closed in your own general ledger is a finance\n` +
          `           decision — use --from / --to to keep this out of a closed period.${RESET}`
      );
    }
    console.log(`${DIM}Sources:   ${ONLY ? ONLY.join(', ') : SOURCES.map((s) => s.key).join(', ')}${RESET}\n`);

    for (const source of SOURCES) {
      if (ONLY && !ONLY.includes(source.key)) continue;
      console.log(`${DIM}  ${source.key.padEnd(12)} ${source.note}${RESET}`);
    }
    console.log('');

    let totalPosted = 0;
    let totalDuplicate = 0;
    let totalRefused = 0;

    for (const tenantId of tenants) {
      console.log(`${BOLD}${CYAN}${tenantId}${RESET}`);
      const outcomes = await backfillTenant(db, tenantId);

      for (const outcome of outcomes) {
        totalPosted += outcome.posted;
        totalDuplicate += outcome.duplicate;
        totalRefused += outcome.refused;

        const verb = CONFIRM ? 'posted' : 'would post';
        console.log(
          `  ${outcome.key.padEnd(12)} examined ${String(outcome.examined).padStart(6)}  ` +
            `${verb} ${String(outcome.posted).padStart(6)}  ` +
            `already there ${String(outcome.duplicate).padStart(6)}  ` +
            `${outcome.refused > 0 ? RED : DIM}refused ${String(outcome.refused).padStart(6)}${RESET}`
        );

        for (const refusal of outcome.refusals) {
          console.log(`${DIM}      ${refusal.sourceId}  ${refusal.reason}${RESET}`);
        }
        if (outcome.refused > outcome.refusals.length) {
          console.log(
            `${DIM}      … and ${outcome.refused - outcome.refusals.length} more refusals not listed.${RESET}`
          );
        }
      }
      console.log('');
    }

    if (!CONFIRM) {
      console.log(
        `${YELLOW}${BOLD}DRY RUN — nothing was written.${RESET}\n` +
          `${DIM}"would post" counts every posting this run would ATTEMPT. Any record already in\n` +
          `the ledger will come back as "already there" on the real run rather than double-posting:\n` +
          `the idempotency key makes that safe by construction, not by this script keeping state.\n\n` +
          `Re-run with --confirm to apply.${RESET}\n`
      );
      return;
    }

    await db.collection('tbltenant_repair_audit').insertOne({
      at: new Date(),
      actor: 'scripts/backfill-allocation-ledger.ts',
      action: 'ALLOCATION_LEDGER_BACKFILL',
      tenantId: TENANT ?? '(all tenants)',
      from: FROM_DATE ?? null,
      to: TO_DATE ?? null,
      sources: ONLY ?? SOURCES.map((s) => s.key),
      posted: totalPosted,
      duplicate: totalDuplicate,
      refused: totalRefused,
    });

    console.log(
      `${BOLD}Posted ${totalPosted}. Already present ${totalDuplicate}. Refused ${totalRefused}.${RESET}`
    );
    console.log(`${DIM}Recorded in tbltenant_repair_audit.${RESET}`);
    if (totalRefused > 0) {
      console.log(
        `\n${YELLOW}Refusals are NOT failures to retry blindly.${RESET}\n` +
          `${DIM}  Each one is a property of that record — no date, no amount, an unresolvable\n` +
          `  plate, or a foreign currency with no rate. Fix the record, then re-run: anything\n` +
          `  already posted is a no-op.${RESET}`
      );
    }
    console.log(
      `\n${DIM}The ledger is APPEND-ONLY. If this posted something it should not have, correct it\n` +
        `with a reversing entry — do not delete rows.${RESET}\n`
    );
  } finally {
    await client.close();
  }
}

async function resolveTenants(db: Db): Promise<string[]> {
  if (TENANT) return [TENANT];

  const slugs = await db
    .collection('tblorganizations')
    .distinct('slug', { isDeleted: { $ne: true } });
  const tenants = slugs.filter((s): s is string => typeof s === 'string' && s.length > 0);

  if (tenants.length > 1 && !ALL_TENANTS) {
    console.error(
      `${RED}This database contains ${tenants.length} organizations and no --tenant was given.${RESET}\n` +
        `${DIM}Backfilling every customer's ledger at once is almost never what is meant.\n` +
        `Pass --tenant <slug>, or --yes-all-tenants if it really is.${RESET}`
    );
    process.exit(1);
  }
  return tenants;
}

main().catch((error) => {
  console.error(`${RED}Backfill failed:${RESET}`, error);
  process.exit(1);
});
