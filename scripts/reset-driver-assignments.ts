// scripts/reset-driver-assignments.ts
//
// PART 3 ("Reset current driver assignments"). Clears
// Vehicle.currentDriverId for a tenant so every vehicle in scope goes
// back to "Unassigned" and can be re-assigned from the Vehicle
// Operational Hub with a clean slate.
//
// ---------------------------------------------------------------------
// SCOPE -- read this before running it
// ---------------------------------------------------------------------
// This script touches EXACTLY ONE FIELD on ONE COLLECTION:
//
//     tblvehicles.currentDriverId  ->  null
//
// It does NOT touch, delete, or modify:
//   * tblvehicles -- any other field (license_plate, make, model, status,
//     odometer, everything else on the vehicle stays exactly as it is)
//   * tbldrivers -- the driver roster is untouched; no driver is deleted
//     or disabled
//   * tblfuellogs -- fuel records, and in particular FuelLog.driver_id on
//     every existing fuel log, are completely unaffected. See "WHY THIS
//     DOES NOT TOUCH FUEL ANALYTICS" below -- this is the single most
//     important thing to understand before running this script.
//   * tblexpenses, tbltrips, tblallocationledger, or any other
//     operational/financial collection
//   * tbladmin, tblorganizations, tblorgunits, tblcustomroles,
//     tblresourcepermissions, tbluser_scope_assignments, or anything
//     else related to authentication, authorization or tenancy
//
// This is a direct, tenant-scoped MongoDB write -- the same class of
// operation as scripts/backfill-fuel-type-normalization.ts and
// scripts/reset-business-data.ts, and it follows their conventions:
// dry-run by default, an explicit --confirm to apply, a full manifest
// printed BEFORE anything changes, and a summary record written to
// tbltenant_repair_audit (the same collection every other repair/reset
// script in this repository uses) so "what happened and when" has one
// answer. Vehicle documents are only ever updateOne'd, never deleted;
// nothing is dropped.
//
// ---------------------------------------------------------------------
// WHY THIS DOES NOT TOUCH FUEL ANALYTICS -- READ THIS
// ---------------------------------------------------------------------
// It may look like this script is a prerequisite for fixing "Fuel cost
// by driver" or similar fuel analytics. It is not, and running it will
// not change a single number on those screens.
//
// Investigation of modules/fuel/commands/handlers/create-fuel-log.handler.ts
// and update-fuel-log.handler.ts (see also
// tests/security/fuel-form-never-assigns-vehicle-driver.spec.ts) confirmed
// that FuelLog.driver_id is TRANSACTION-TIME attribution: it is set once,
// explicitly, when a fuel log is created or edited, and is never derived
// from -- or written back to -- Vehicle.currentDriverId. Every fuel
// analytic that groups by driver (Fuel cost by driver, driver-level
// intelligence, etc.) reads FuelLog.driver_id, not the vehicle's current
// assignment. shared/types/fuel.types.ts documents this explicitly:
// backfilling the vehicle's present driver onto historical fuel logs
// would silently rewrite one person's fuel spend onto another, which is
// exactly the failure mode PART 4 of the specification this script was
// built for explicitly forbids ("Do not assume that historical fuel
// records should automatically change driver when the current vehicle
// assignment changes").
//
// What THIS script actually resets is narrower and different: the
// Vehicle Operational Hub's "current driver" field for each vehicle --
// the thing PART 2/PART 4 say should be the single place driver
// assignment happens going forward. If some vehicles currently hold a
// stale or incorrect currentDriverId (e.g. from data migration, a prior
// bulk import, or manual DB edits before this rule was enforced), this
// script clears that so an administrator can re-assign correctly from
// the Vehicle Hub. It has no effect on any fuel report.
//
// ---------------------------------------------------------------------
// REVERSIBLE
// ---------------------------------------------------------------------
// Clearing currentDriverId is not destructive in the way a delete is:
// every vehicle this script touches can be manually re-assigned a driver
// afterwards from the Vehicle Operational Hub (Vehicle -> Driver
// Assignment), one at a time or however the fleet manager chooses. The
// audit record this script writes lists exactly which vehicle held which
// driver beforehand, so "what it used to be" is never lost even though
// the field itself is cleared.
//
// ---------------------------------------------------------------------
// NEVER RUNS AUTOMATICALLY
// ---------------------------------------------------------------------
// This script is not wired into any build, deploy, postinstall, or
// startup path -- it is invoked manually, exactly once, when an
// administrator decides to reset assignments. `npm run db:*` scripts in
// this repository are never executed by `npm install`, `npm run build`,
// or `npm start`.
//
// Usage:
//   npm run db:reset-driver-assignments -- --tenant <slug>              # dry run
//   npm run db:reset-driver-assignments -- --tenant <slug> --confirm    # apply
//
// (equivalently: npx tsx scripts/reset-driver-assignments.ts --tenant <slug> [--confirm])

import 'dotenv/config';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { buildTenantIdentityIndex, resolveCanonical } from './lib/tenant-identity';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) return undefined;
  const value = process.argv[i + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

interface VehicleAssignmentDoc {
  _id: ObjectId;
  license_plate?: string;
  currentDriverId?: string | null;
}

async function main(): Promise<void> {
  const tenantArg = argValue('tenant');
  const confirm = hasFlag('confirm');

  if (!tenantArg) {
    console.error(`${RED}--tenant <slug> is required. Tenant is never inferred or defaulted.${RESET}`);
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`${RED}MONGODB_URI is not set.${RESET}`);
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db: Db = client.db();

  try {
    await run(db, tenantArg, confirm);
  } finally {
    await client.close();
  }
}

async function run(db: Db, tenantArg: string, confirm: boolean): Promise<void> {
  const index = await buildTenantIdentityIndex(db);
  const tenantId = resolveCanonical(index, tenantArg);
  if (!tenantId) {
    console.error(`${RED}"${tenantArg}" does not resolve to a real organization. Check spelling -- tenant is never guessed.${RESET}`);
    process.exit(1);
  }

  const vehicles = db.collection<VehicleAssignmentDoc>('tblvehicles');

  const candidates = await vehicles
    .find(
      {
        tenantId,
        isDeleted: { $ne: true },
        currentDriverId: { $exists: true, $nin: [null, ''] },
      } as Record<string, unknown>,
      { projection: { license_plate: 1, currentDriverId: 1 } }
    )
    .toArray();

  console.log('');
  console.log(`${BOLD}Driver assignment reset -- ${tenantId}${RESET}`);
  console.log(
    confirm
      ? `${RED}${BOLD}MODE: APPLY -- ${candidates.length} vehicle(s) will have their current driver cleared.${RESET}`
      : `${GREEN}${BOLD}MODE: DRY RUN -- nothing will be changed. Pass --confirm to apply.${RESET}`
  );
  console.log(`${DIM}Scope: tblvehicles.currentDriverId only. Drivers, fuel logs and every other collection are untouched.${RESET}`);
  console.log(`${DIM}${'='.repeat(88)}${RESET}`);

  if (candidates.length === 0) {
    console.log(`${GREEN}Nothing to do.${RESET} No vehicle in this tenant currently has a driver assigned.`);
    return;
  }

  // Resolve driver names for a readable manifest (best-effort -- a
  // missing/dangling driver id is shown as-is rather than failing the
  // whole run, since the point of this script is precisely to clean up
  // assignment state that may already be inconsistent).
  const driverIds = Array.from(
    new Set(candidates.map((v) => v.currentDriverId).filter((id): id is string => Boolean(id)))
  );
  const objectIdDriverIds = driverIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const drivers = objectIdDriverIds.length
    ? await db
        .collection('tbldrivers')
        .find({ _id: { $in: objectIdDriverIds } }, { projection: { name: 1 } })
        .toArray()
    : [];
  const driverNameById = new Map<string, string>(drivers.map((d) => [String(d._id), String(d.name ?? d._id)]));

  console.log(`${BOLD}MANIFEST${RESET} ${DIM}(vehicle -> driver currently assigned)${RESET}`);
  console.log(`${DIM}${'license plate'.padEnd(18)} ${'vehicle id'.padEnd(26)} driver${RESET}`);
  const manifestRows: Array<{ vehicleId: string; license_plate: string; previousDriverId: string; previousDriverName: string }> = [];
  for (const v of candidates) {
    const driverId = String(v.currentDriverId);
    const driverName = driverNameById.get(driverId) ?? `${driverId} (not found -- dangling reference)`;
    console.log(`${YELLOW}${(v.license_plate ?? '(no plate)').padEnd(18)}${RESET} ${DIM}${String(v._id).padEnd(26)}${RESET} ${driverName}`);
    manifestRows.push({
      vehicleId: String(v._id),
      license_plate: v.license_plate ?? '',
      previousDriverId: driverId,
      previousDriverName: driverName,
    });
  }

  console.log('');
  console.log(`${BOLD}Total vehicles to reset: ${candidates.length}${RESET}`);

  if (!confirm) {
    console.log('');
    console.log(`${GREEN}Dry run complete. Nothing was changed.${RESET}`);
    console.log(`${DIM}Re-run with --confirm to apply.${RESET}`);
    console.log(
      `${DIM}After applying, reassign each vehicle's driver from the Vehicle Operational Hub\n` +
        `(Vehicle -> Driver Assignment). This does not change any existing fuel log's own\n` +
        `driver attribution -- see this script's header comment for why.${RESET}\n`
    );
    return;
  }

  console.log('');
  console.log(`${RED}${BOLD}APPLYING…${RESET}`);
  let updated = 0;
  const failures: string[] = [];

  for (const row of manifestRows) {
    try {
      const result = await vehicles.updateOne(
        { _id: new ObjectId(row.vehicleId) },
        { $set: { currentDriverId: null, updatedAt: new Date() } }
      );
      if (result.modifiedCount > 0) {
        updated += 1;
        console.log(`  ${GREEN}✓${RESET} ${row.license_plate.padEnd(18)} cleared (was: ${row.previousDriverName})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${row.license_plate || row.vehicleId}: ${message}`);
      console.log(`  ${RED}✗${RESET} ${row.license_plate.padEnd(18)} ${RED}${message}${RESET}`);
    }
  }

  await db.collection('tbltenant_repair_audit').insertOne({
    at: new Date(),
    actor: 'scripts/reset-driver-assignments.ts',
    action: 'DRIVER_ASSIGNMENT_RESET',
    tenantId,
    vehiclesUpdated: updated,
    vehicles: manifestRows.map((r) => ({
      vehicleId: r.vehicleId,
      license_plate: r.license_plate,
      previousDriverId: r.previousDriverId,
      previousDriverName: r.previousDriverName,
      newDriverId: null,
    })),
    failures,
  });

  console.log('');
  console.log(`${BOLD}Cleared currentDriverId on ${updated} vehicle(s).${RESET}`);
  if (failures.length > 0) {
    console.log(`${RED}${failures.length} vehicle(s) failed -- see above.${RESET}`);
  }
  console.log(`${DIM}Recorded in tbltenant_repair_audit (full before/after per vehicle).${RESET}`);
  console.log(
    `\n${YELLOW}${BOLD}NEXT STEPS${RESET}\n` +
      `${DIM}  1. Go to each vehicle's page in the Vehicle Operational Hub.\n` +
      `  2. Use Driver Assignment to assign the correct current driver.\n` +
      `  3. Existing fuel logs and their driver attribution are unaffected -- nothing to redo there.${RESET}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${RED}Driver assignment reset failed:${RESET}`, error);
    process.exit(1);
  });
}

export { run };
