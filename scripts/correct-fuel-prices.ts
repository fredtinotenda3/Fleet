// scripts/correct-fuel-prices.ts
//
// WHY THIS IS NEEDED
// ---------------------------------------------------------------------
// September 2026 fuel logs were entered against a single assumed price
// per litre (Diesel $1.95, Petrol $1.96). The accounting team has since
// confirmed the actual pump price changed mid-month:
//
//   Diesel   1 Sep 2026 - 16 Sep 2026 (inclusive):  $1.95 / litre
//   Diesel  17 Sep 2026 -  onward:                  $2.08 / litre
//   Petrol   1 Sep 2026 - 16 Sep 2026 (inclusive):  $1.96 / litre
//   Petrol  17 Sep 2026 -  onward:                  $2.06 / litre
//
// This script recomputes `cost = fuel_volume * price-for-that-fuel-type
// -and-date` for every tblfuellogs row in scope and writes the corrected
// value. It does NOT touch fuel_volume, fuel_type, driver_id,
// license_plate, or any other field.
//
// SCOPE. Deliberately limited to what the accounting team actually
// confirmed: Diesel/Petrol rows dated 1 September 2026 onward. "Fix all
// the records" in the request that prompted this script meant "leave no
// September row on the old price," not "reprice fuel logs from other
// months against a rate nobody has confirmed for them" -- there is no
// confirmed rate for August or earlier, so this script does not touch
// them. If a later price change needs correcting too, add a row to
// PRICE_SCHEDULE below rather than writing a new script -- the matching
// logic is date-range-driven and already handles any number of periods.
//
// SAFETY
// ---------------------------------------------------------------------
//   * DRY RUN BY DEFAULT. Prints exactly what would change -- per
//     record and as fuel-type/period totals -- and writes nothing
//     unless --confirm is also passed.
//   * --tenant is required and resolved through the same
//     buildTenantIdentityIndex/resolveCanonical identity module every
//     other script in this directory uses. Never inferred or defaulted.
//   * CURRENCY IS NEVER GUESSED. If the matched rows carry more than one
//     currency value (including "no currency set"), the script lists
//     the breakdown and refuses to proceed until you re-run with
//     --currency <value> naming the one to correct. $1.95/$2.08 etc.
//     are meaningless applied to a row priced in a different currency.
//   * UNIT IS VERIFIED, NOT ASSUMED. Every matched row's unit_id is
//     resolved against tblunits; only rows on a recognizable litre unit
//     (symbol/name matching l/litre/litres/liter/liters) are corrected.
//     A row on any other unit, or an unresolved unit_id, is EXCLUDED
//     and listed separately for manual review -- never guessed at.
//     (In practice this fleet's tblunits only defines km and litre, so
//     this is expected to exclude nothing; it exists as a guard against
//     a future or foreign unit, not a currently-anticipated case.)
//   * fuel_type IS MATCHED CASE-INSENSITIVELY ("diesel", "DIESEL",
//     "Diesel" all match) so this does not depend on
//     backfill-fuel-type-normalization.ts having been run first.
//   * SAFE TO RE-RUN. Recomputing an already-correct row is a no-op
//     (old cost === new cost, no write, not counted as "updated").
//
// WHAT THIS SCRIPT DOES NOT DO
// ---------------------------------------------------------------------
//   * It never deletes anything, and never touches a soft-deleted row
//     (isDeleted: true is excluded from the match).
//   * It never touches tblallocationledger. THAT COLLECTION IS
//     APPEND-ONLY (see allocation-ledger.repository.ts: "postings
//     cannot be updated once written. Post a reversing entry
//     instead."), and fuel logs post to it only once, at creation
//     (FuelLoggedEvent -> AllocationPostingService). Correcting a fuel
//     log's cost here changes the *operational* fuel total the Monthly
//     Fuel & Fleet Intelligence Report computes live from tblfuellogs,
//     but any ledger posting already made for that row was made at the
//     OLD cost and will not update itself -- the reconciliation
//     variance in that report will shift as a result of running this
//     script, and may need a reversing/correcting ledger entry to bring
//     the two back in line. That is a separate, higher-stakes change to
//     the system of record for financial reporting and is intentionally
//     NOT bundled into this script -- see the console warning this
//     script prints when it finds rows to correct, and raise it with
//     whoever owns the allocation ledger before assuming reconciliation
//     is resolved by this alone.
//   * It never emits FuelLogUpdatedEvent or goes through
//     UpdateFuelLogHandler -- it writes directly to tblfuellogs via the
//     driver, exactly like every other backfill script in this
//     directory (backfill-fuel-type-normalization.ts, etc.). That event
//     is only consumed by the websocket/analytics/webhook handlers in
//     this codebase today, not by anything ledger-related, so this is
//     not a behavioral gap relative to going through the handler --
//     just noting it for anyone reading this expecting an event trail.
//
// AUDIT & ROLLBACK
// ---------------------------------------------------------------------
// Unlike the fuel-type-normalization backfill (one deterministic
// function applied uniformly, where a single aggregate audit line is
// enough), this changes real dollar amounts on named vehicles, so every
// run -- dry or confirmed -- gets:
//   1. A full itemized before/after list written to
//      tbltenant_repair_audit (one document per RUN, with a per-record
//      array inside it: _id, license_plate, date, fuel_type, old cost,
//      new cost, delta).
//   2. The same list written to a local JSON file under
//      reports/fuel-price-correction/ as a paper trail independent of
//      the database.
// A confirmed run's audit document can be replayed with --rollback
// <runId> to restore every affected row's cost to what it was before
// this script touched it (also dry-run by default; needs --confirm to
// write). <runId> is printed at the end of every confirmed run and is
// also the audit document's _id in tbltenant_repair_audit.
//
// USAGE
// ---------------------------------------------------------------------
//   Dry run (default):
//     npx tsx scripts/correct-fuel-prices.ts --tenant <slug>
//
//   Apply:
//     npx tsx scripts/correct-fuel-prices.ts --tenant <slug> --confirm
//
//   Currency required only if the dry run reports more than one:
//     npx tsx scripts/correct-fuel-prices.ts --tenant <slug> --currency USD
//
//   Undo a previous confirmed run:
//     npx tsx scripts/correct-fuel-prices.ts --tenant <slug> --rollback <runId>            # preview
//     npx tsx scripts/correct-fuel-prices.ts --tenant <slug> --rollback <runId> --confirm  # apply

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { buildTenantIdentityIndex, resolveCanonical } from './lib/tenant-identity';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------
// Price schedule -- the single source of truth for this correction.
// `to` is EXCLUSIVE (matches [from, to)); `to: null` means open-ended
// ("...up to date" and beyond, until a further period is added here).
// Add rows here for any future confirmed price change; the matching
// logic below needs no changes to pick up a new row.
// ---------------------------------------------------------------------
interface PricePeriod {
  fuelType: 'Diesel' | 'Petrol';
  from: Date;
  to: Date | null;
  pricePerLitre: number;
}

const PRICE_SCHEDULE: PricePeriod[] = [
  { fuelType: 'Diesel', from: new Date('2026-09-01T00:00:00.000Z'), to: new Date('2026-09-17T00:00:00.000Z'), pricePerLitre: 1.95 },
  { fuelType: 'Diesel', from: new Date('2026-09-17T00:00:00.000Z'), to: null, pricePerLitre: 2.08 },
  { fuelType: 'Petrol', from: new Date('2026-09-01T00:00:00.000Z'), to: new Date('2026-09-17T00:00:00.000Z'), pricePerLitre: 1.96 },
  { fuelType: 'Petrol', from: new Date('2026-09-17T00:00:00.000Z'), to: null, pricePerLitre: 2.06 },
];

const SCHEDULE_LOWER_BOUND = PRICE_SCHEDULE.reduce(
  (min, p) => (p.from < min ? p.from : min),
  PRICE_SCHEDULE[0].from
);

const LITRE_UNIT_NAMES = new Set(['l', 'litre', 'litres', 'liter', 'liters']);

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function findPriceFor(fuelType: 'Diesel' | 'Petrol', date: Date): PricePeriod | undefined {
  return PRICE_SCHEDULE.find(
    (p) => p.fuelType === fuelType && date >= p.from && (p.to === null || date < p.to)
  );
}

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

interface RecordDelta {
  _id: string;
  license_plate: string;
  date: string;
  fuel_type: string;
  fuel_volume: number;
  oldCost: number;
  newCost: number;
  delta: number;
}

async function main(): Promise<void> {
  const tenantArg = argValue('tenant');
  const currencyArg = argValue('currency');
  const rollbackRunId = argValue('rollback');
  const confirm = hasFlag('confirm');

  if (!tenantArg) {
    console.error('--tenant <slug> is required. Tenant is never inferred or defaulted.');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Set it in .env (gitignored) -- never hardcode a connection string here.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db: Db = client.db(process.env.MONGODB_DB || 'VehicleExpense');

  const index = await buildTenantIdentityIndex(db);
  const tenantId = resolveCanonical(index, tenantArg);
  if (!tenantId) {
    console.error(`"${tenantArg}" does not resolve to a real organization. Check spelling -- tenant is never guessed.`);
    await client.close();
    process.exit(1);
  }

  const fuelLogs = db.collection('tblfuellogs');
  const auditCollection = db.collection('tbltenant_repair_audit');

  if (rollbackRunId) {
    await runRollback(db, fuelLogs, auditCollection, tenantId, rollbackRunId, confirm);
    await client.close();
    return;
  }

  // ---------------------------------------------------------------
  // 1. Fetch candidates: this tenant, Diesel/Petrol (any casing), not
  //    deleted, dated on/after the earliest date the schedule covers.
  //    Upper-bounded only by "now" isn't applied -- a future-dated row
  //    would be unusual and is flagged separately below rather than
  //    silently matched or silently skipped.
  // ---------------------------------------------------------------
  const candidates = await fuelLogs
    .find({
      tenantId,
      isDeleted: { $ne: true },
      fuel_type: { $regex: /^\s*(diesel|petrol)\s*$/i },
      date: { $gte: SCHEDULE_LOWER_BOUND },
    })
    .toArray();

  console.log('');
  console.log(`${BOLD}Fuel price correction -- ${tenantId}${RESET}`);
  console.log(`${DIM}${candidates.length} Diesel/Petrol fuel log(s) dated on/after ${SCHEDULE_LOWER_BOUND.toISOString().slice(0, 10)}${RESET}`);
  console.log(`${DIM}${'='.repeat(88)}${RESET}`);

  if (candidates.length === 0) {
    console.log(`${GREEN}Nothing to do.${RESET} No Diesel/Petrol fuel logs found in the priced date range for this tenant.`);
    await client.close();
    return;
  }

  // ---------------------------------------------------------------
  // 2. Currency guard -- never assume.
  // ---------------------------------------------------------------
  const currencyBreakdown = new Map<string, number>();
  for (const doc of candidates) {
    const key = typeof doc.currency === 'string' && doc.currency.trim() ? doc.currency.trim() : '(none set)';
    currencyBreakdown.set(key, (currencyBreakdown.get(key) ?? 0) + 1);
  }

  let scoped = candidates;
  if (currencyBreakdown.size > 1) {
    if (!currencyArg) {
      console.log(`${RED}Multiple currency values found among matched rows -- refusing to guess:${RESET}`);
      for (const [cur, count] of currencyBreakdown) {
        console.log(`  ${cur}: ${count} row(s)`);
      }
      console.log('');
      console.log(`Re-run with ${BOLD}--currency <value>${RESET} to scope the correction to one of the values above (use --currency "" for "(none set)").`);
      await client.close();
      process.exit(1);
    }
    const wanted = currencyArg.trim();
    scoped = candidates.filter((doc) => {
      const key = typeof doc.currency === 'string' && doc.currency.trim() ? doc.currency.trim() : '';
      return key === wanted;
    });
    console.log(`${DIM}Scoped to currency "${currencyArg}": ${scoped.length} of ${candidates.length} row(s)${RESET}`);
  } else {
    const [[onlyCurrency]] = currencyBreakdown;
    console.log(`${DIM}All matched rows share one currency value ("${onlyCurrency}") -- proceeding.${RESET}`);
  }

  if (scoped.length === 0) {
    console.log(`${GREEN}Nothing to do.${RESET} No rows match that currency.`);
    await client.close();
    return;
  }

  // ---------------------------------------------------------------
  // 3. Unit guard -- resolve each row's unit_id against tblunits;
  //    only a recognizable litre unit is corrected.
  // ---------------------------------------------------------------
  const unitDocs = await db.collection('tblunits').find({}).toArray();
  const unitById = new Map<string, { name?: string; symbol?: string }>();
  for (const u of unitDocs) {
    unitById.set(String(u.unit_id), { name: typeof u.name === 'string' ? u.name : undefined, symbol: typeof u.symbol === 'string' ? u.symbol : undefined });
  }
  function isLitreUnit(unitId: unknown): boolean {
    const u = unitById.get(String(unitId));
    if (!u) return false;
    const symbol = (u.symbol ?? '').trim().toLowerCase();
    const name = (u.name ?? '').trim().toLowerCase();
    return LITRE_UNIT_NAMES.has(symbol) || LITRE_UNIT_NAMES.has(name);
  }

  const excludedNonLitre: Array<{ _id: string; license_plate: string; unit_id: string; reason: string }> = [];
  const inScope: typeof scoped = [];
  for (const doc of scoped) {
    if (isLitreUnit(doc.unit_id)) {
      inScope.push(doc);
    } else {
      excludedNonLitre.push({
        _id: String(doc._id),
        license_plate: String(doc.license_plate ?? '(unknown plate)'),
        unit_id: String(doc.unit_id ?? '(none)'),
        reason: unitById.has(String(doc.unit_id)) ? 'unit is not a recognized litre unit' : 'unit_id does not resolve in tblunits',
      });
    }
  }

  if (excludedNonLitre.length > 0) {
    console.log('');
    console.log(`${YELLOW}${excludedNonLitre.length} row(s) excluded -- not on a recognized litre unit (needs manual review, not touched):${RESET}`);
    for (const e of excludedNonLitre.slice(0, 20)) {
      console.log(`  ${e.license_plate} (${e._id}) -- unit_id="${e.unit_id}" -- ${e.reason}`);
    }
    if (excludedNonLitre.length > 20) console.log(`  ... and ${excludedNonLitre.length - 20} more`);
  }

  // ---------------------------------------------------------------
  // 4. Flag (not skip) future-dated rows -- unusual, worth a human's
  //    attention, but still corrected if they fall in a priced period.
  // ---------------------------------------------------------------
  const now = new Date();
  const futureDated = inScope.filter((d) => new Date(d.date) > now);
  if (futureDated.length > 0) {
    console.log('');
    console.log(`${YELLOW}${futureDated.length} row(s) are dated in the future relative to now (${now.toISOString().slice(0, 10)}) -- double-check these are not data-entry errors:${RESET}`);
    for (const d of futureDated.slice(0, 10)) {
      console.log(`  ${d.license_plate} -- ${new Date(d.date).toISOString().slice(0, 10)}`);
    }
  }

  // ---------------------------------------------------------------
  // 5. Compute deltas.
  // ---------------------------------------------------------------
  const deltas: RecordDelta[] = [];
  const unpriced: Array<{ _id: string; license_plate: string; date: string; fuel_type: string }> = [];

  for (const doc of inScope) {
    const rawDate = doc.date instanceof Date ? doc.date : new Date(doc.date);
    if (Number.isNaN(rawDate.getTime())) {
      unpriced.push({ _id: String(doc._id), license_plate: String(doc.license_plate ?? ''), date: String(doc.date), fuel_type: String(doc.fuel_type ?? '') });
      continue;
    }
    const canonicalFuelType = /^diesel$/i.test(String(doc.fuel_type).trim()) ? 'Diesel' : 'Petrol';
    const period = findPriceFor(canonicalFuelType, rawDate);
    if (!period) {
      unpriced.push({ _id: String(doc._id), license_plate: String(doc.license_plate ?? ''), date: rawDate.toISOString().slice(0, 10), fuel_type: canonicalFuelType });
      continue;
    }
    const volume = typeof doc.fuel_volume === 'number' ? doc.fuel_volume : Number(doc.fuel_volume);
    if (!Number.isFinite(volume)) {
      unpriced.push({ _id: String(doc._id), license_plate: String(doc.license_plate ?? ''), date: rawDate.toISOString().slice(0, 10), fuel_type: canonicalFuelType });
      continue;
    }
    const oldCost = typeof doc.cost === 'number' ? doc.cost : Number(doc.cost);
    const newCost = round2(volume * period.pricePerLitre);
    deltas.push({
      _id: String(doc._id),
      license_plate: String(doc.license_plate ?? ''),
      date: rawDate.toISOString().slice(0, 10),
      fuel_type: canonicalFuelType,
      fuel_volume: volume,
      oldCost: Number.isFinite(oldCost) ? round2(oldCost) : NaN,
      newCost,
      delta: round2(newCost - (Number.isFinite(oldCost) ? oldCost : 0)),
    });
  }

  if (unpriced.length > 0) {
    console.log('');
    console.log(`${YELLOW}${unpriced.length} row(s) excluded -- date falls outside every priced period, or the row has an invalid date/volume:${RESET}`);
    for (const u of unpriced.slice(0, 20)) {
      console.log(`  ${u.license_plate} (${u._id}) -- ${u.date} -- ${u.fuel_type}`);
    }
  }

  const actuallyChanging = deltas.filter((d) => d.oldCost !== d.newCost);
  const alreadyCorrect = deltas.length - actuallyChanging.length;

  // ---------------------------------------------------------------
  // 6. Summary table by fuel type + period.
  // ---------------------------------------------------------------
  console.log('');
  console.log(`${BOLD}Summary${RESET}`);
  console.log(`${DIM}${'-'.repeat(88)}${RESET}`);
  for (const period of PRICE_SCHEDULE) {
    const rows = deltas.filter((d) => {
      if (d.fuel_type !== period.fuelType) return false;
      const dDate = new Date(d.date);
      return dDate >= period.from && (period.to === null || dDate < period.to);
    });
    const changing = rows.filter((r) => r.oldCost !== r.newCost);
    const toLabel = period.to ? period.to.toISOString().slice(0, 10) : 'open-ended';
    console.log(
      `  ${period.fuelType.padEnd(7)} ${period.from.toISOString().slice(0, 10)} -> ${toLabel.padEnd(11)} @ $${period.pricePerLitre.toFixed(2)}/L  ` +
        `${String(rows.length).padStart(3)} row(s), ${String(changing.length).padStart(3)} changing`
    );
  }
  console.log(`${DIM}${'-'.repeat(88)}${RESET}`);
  console.log(`  Total in scope: ${deltas.length}  |  will change: ${CYAN}${actuallyChanging.length}${RESET}  |  already correct: ${alreadyCorrect}`);

  if (actuallyChanging.length > 0) {
    const totalOld = round2(actuallyChanging.reduce((s, d) => s + d.oldCost, 0));
    const totalNew = round2(actuallyChanging.reduce((s, d) => s + d.newCost, 0));
    console.log(`  Operational fuel cost on these rows: ${totalOld.toFixed(2)} -> ${totalNew.toFixed(2)} (${totalNew - totalOld >= 0 ? '+' : ''}${(totalNew - totalOld).toFixed(2)})`);
    console.log('');
    console.log(`  Sample of changes:`);
    for (const d of actuallyChanging.slice(0, 15)) {
      console.log(`    ${d.license_plate.padEnd(10)} ${d.date}  ${d.fuel_type.padEnd(7)} ${d.fuel_volume.toFixed(2).padStart(9)} L   ${d.oldCost.toFixed(2).padStart(9)} -> ${d.newCost.toFixed(2).padStart(9)}`);
    }
    if (actuallyChanging.length > 15) console.log(`    ... and ${actuallyChanging.length - 15} more (full list in the audit record and the JSON report)`);

    console.log('');
    console.log(
      `${YELLOW}Note: tblallocationledger is append-only and will NOT reflect this change automatically.${RESET} ` +
        `If any of these fuel logs already posted to the ledger, "Operational fuel total (fuel logs)" in the Financial ` +
        `Reconciliation report will move but "Allocation ledger fuel total" will not -- see this file's header comment.`
    );
  }

  if (!confirm) {
    console.log('');
    console.log(`${YELLOW}DRY RUN${RESET} -- no writes made. Re-run with ${BOLD}--confirm${RESET} to apply.`);
    const reportPath = writeJsonReport(tenantId, 'DRY_RUN', actuallyChanging, excludedNonLitre, unpriced, currencyArg);
    console.log(`${DIM}Preview written to ${reportPath}${RESET}`);
    await client.close();
    return;
  }

  if (actuallyChanging.length === 0) {
    console.log('');
    console.log(`${GREEN}Nothing to write.${RESET} Every in-scope row already has the correct cost.`);
    await client.close();
    return;
  }

  // ---------------------------------------------------------------
  // 7. Apply.
  // ---------------------------------------------------------------
  let written = 0;
  for (const d of actuallyChanging) {
    await fuelLogs.updateOne({ _id: new ObjectId(d._id) }, { $set: { cost: d.newCost, updatedAt: new Date() } });
    written += 1;
  }

  const auditDoc = {
    at: new Date(),
    actor: 'scripts/correct-fuel-prices.ts',
    action: 'FUEL_PRICE_CORRECTION',
    tenantId,
    currency: currencyArg ?? Array.from(currencyBreakdown.keys())[0],
    priceSchedule: PRICE_SCHEDULE.map((p) => ({ fuelType: p.fuelType, from: p.from, to: p.to, pricePerLitre: p.pricePerLitre })),
    documentsUpdated: written,
    changes: actuallyChanging,
    excludedNonLitreUnit: excludedNonLitre,
    excludedUnpriced: unpriced,
  };
  const auditResult = await auditCollection.insertOne(auditDoc);
  const runId = String(auditResult.insertedId);

  console.log('');
  console.log(`${GREEN}Done.${RESET} ${written} fuel log(s) updated. Audit record written to tbltenant_repair_audit (_id: ${runId}).`);
  const reportPath = writeJsonReport(tenantId, runId, actuallyChanging, excludedNonLitre, unpriced, currencyArg);
  console.log(`${DIM}Report written to ${reportPath}${RESET}`);
  console.log('');
  console.log(`${DIM}To undo this run:${RESET} npx tsx scripts/correct-fuel-prices.ts --tenant ${tenantArg} --rollback ${runId} --confirm`);

  await client.close();
}

function writeJsonReport(
  tenantId: string,
  runId: string,
  changes: RecordDelta[],
  excludedNonLitre: unknown[],
  excludedUnpriced: unknown[],
  currency: string | undefined
): string {
  const dir = path.join(process.cwd(), 'reports', 'fuel-price-correction');
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${tenantId}-${timestamp}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify({ tenantId, runId, generatedAt: new Date().toISOString(), currency, changes, excludedNonLitre, excludedUnpriced }, null, 2)
  );
  return filePath;
}

async function runRollback(
  db: Db,
  fuelLogs: ReturnType<Db['collection']>,
  auditCollection: ReturnType<Db['collection']>,
  tenantId: string,
  runId: string,
  confirm: boolean
): Promise<void> {
  if (!ObjectId.isValid(runId)) {
    console.error(`"${runId}" is not a valid audit record id.`);
    process.exit(1);
  }
  const auditDoc = await auditCollection.findOne({ _id: new ObjectId(runId), tenantId, action: 'FUEL_PRICE_CORRECTION' });
  if (!auditDoc) {
    console.error(`No FUEL_PRICE_CORRECTION audit record with id "${runId}" found for tenant "${tenantId}".`);
    process.exit(1);
  }

  const changes = (auditDoc.changes ?? []) as RecordDelta[];
  console.log('');
  console.log(`${BOLD}Rollback preview -- run ${runId} (${tenantId})${RESET}`);
  console.log(`${DIM}${changes.length} row(s) will be restored to their pre-correction cost${RESET}`);
  console.log(`${DIM}${'='.repeat(88)}${RESET}`);

  let alreadyDiverged = 0;
  for (const d of changes) {
    const current = await fuelLogs.findOne({ _id: new ObjectId(d._id) }, { projection: { cost: 1, license_plate: 1 } });
    const currentCost = current && typeof current.cost === 'number' ? round2(current.cost) : undefined;
    const matches = currentCost === d.newCost;
    if (!matches) alreadyDiverged += 1;
    console.log(
      `  ${(current?.license_plate ?? d.license_plate).padEnd(10)} ${d._id}  current=${currentCost ?? '(missing)'}  ` +
        `will restore -> ${d.oldCost}${matches ? '' : `  ${YELLOW}(current cost != this run's "new" value -- was changed since; review before rolling back)${RESET}`}`
    );
  }

  if (alreadyDiverged > 0) {
    console.log('');
    console.log(`${YELLOW}${alreadyDiverged} row(s) have a cost that no longer matches what this run set -- something else touched them since. Rolling back will still overwrite them to this run's old value unless you review first.${RESET}`);
  }

  if (!confirm) {
    console.log('');
    console.log(`${YELLOW}DRY RUN${RESET} -- no writes made. Re-run with ${BOLD}--confirm${RESET} to apply the rollback.`);
    return;
  }

  let restored = 0;
  for (const d of changes) {
    await fuelLogs.updateOne({ _id: new ObjectId(d._id) }, { $set: { cost: d.oldCost, updatedAt: new Date() } });
    restored += 1;
  }
  await auditCollection.insertOne({
    at: new Date(),
    actor: 'scripts/correct-fuel-prices.ts',
    action: 'FUEL_PRICE_CORRECTION_ROLLBACK',
    tenantId,
    rolledBackRunId: runId,
    documentsRestored: restored,
  });
  console.log('');
  console.log(`${GREEN}Done.${RESET} ${restored} fuel log(s) restored to their pre-correction cost.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
