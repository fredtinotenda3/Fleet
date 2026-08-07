// scripts/move-data-to-harare.ts
//
// Reassigns ALL operational data back onto Harare Branch's own units.
//
// tenancy-rebuild.ts spread vehicles/drivers/fuel/expenses/trips/
// reminders across Harare AND Bulawayo leaf units purely to make
// isolation observable (see that file's header). That was correct for
// demonstrating the scoping fix, but it does not reflect the real
// world: every vehicle, driver, fuel log, expense, reminder, and trip
// in this dataset originated from Harare Branch's own operations.
// Bulawayo is a new branch with members assigned to it but no data of
// its own yet.
//
// This script is the inverse of step 3 of tenancy-rebuild.ts: it moves
// everything back onto two fixed Harare units instead of spreading it.
// It does NOT touch:
//   - tblorgunits            (the hierarchy itself is untouched)
//   - tbluser_scope_assignments (who is assigned where is untouched --
//                                only the DATA's orgUnitId moves, never
//                                a user's assignment)
//   - tblorganizations.members[]
//
// ---------------------------------------------------------------------
// What moves where
// ---------------------------------------------------------------------
//   tblvehicles                 -> Harare Heavy Fleet (6a74694e60900c100f2a4ecb)
//   tblfuellogs   (by plate)    -> same orgUnitId as their vehicle
//   tblexpenses   (by plate)    -> same orgUnitId as their vehicle
//   tbltrips      (by plate)    -> same orgUnitId as their vehicle
//   tblreminders  (by plate)    -> same orgUnitId as their vehicle
//   tbldrivers                  -> Logistics Department (6a74694d60900c100f2a4ec7)
//
// Fuel logs / expenses / trips / reminders that have no `license_plate`
// (not every row is guaranteed to carry one) are moved directly to the
// Harare Heavy Fleet id as a fallback, rather than left on a stale
// Bulawayo orgUnitId -- an orphaned row on the wrong unit is invisible
// to every scoped user, which reads as silent data loss.
//
// Usage:
//   npm run db:move-data-to-harare                # dry run, prints the plan
//   npm run db:move-data-to-harare -- --confirm    # apply
//
// Safety:
//   - Reads MONGODB_URI from the environment (via dotenv) -- never
//     hardcoded.
//   - Refuses to run if either destination org unit id does not exist,
//     is soft-deleted, or does not belong to the resolved organization.
//   - Dry run by default; nothing is written without --confirm.
//   - Idempotent: re-running after --confirm is a no-op (everything is
//     already on the destination units).

/* eslint-disable no-console */

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--confirm');

// Fixed destination units, per the real-world ownership of this data.
const HARARE_HEAVY_FLEET_ID = '6a74694e60900c100f2a4ecb';
const LOGISTICS_DEPARTMENT_ID = '6a74694d60900c100f2a4ec7';

// Child collections keyed off the vehicle's license_plate. Kept as a
// named constant (rather than inlined) because it must stay in sync
// with tenancy-rebuild.ts's CHILD_COLLECTIONS_BY_PLATE -- both scripts
// are describing the same "these rows follow their vehicle" contract.
const CHILD_COLLECTIONS_BY_PLATE = [
  'tblfuellogs',
  'tblexpenses',
  'tbltrips',
  'tblreminders',
];

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
    const org = await db
      .collection('tblorganizations')
      .findOne({ isDeleted: { $ne: true } });
    if (!org) throw new Error('No organization found.');

    const tenantId =
      (typeof org.tenantId === 'string' && org.tenantId) ||
      (typeof org.slug === 'string' && org.slug) ||
      String(org._id);

    console.log('');
    console.log(`${BOLD}Move data to Harare${RESET}`);
    console.log(`  ${org.name}  ${DIM}${tenantId}${RESET}`);
    console.log(`  Mode: ${APPLY ? `${GREEN}APPLY${RESET}` : `${YELLOW}DRY RUN${RESET}`}`);
    console.log(`${DIM}${'='.repeat(74)}${RESET}`);

    // ── Safety check: the destination units must be real, active, and
    //    belong to this organization before anything is touched. ──────
    console.log('');
    console.log(`${BOLD}Destination units${RESET}`);

    const fleetUnit = await resolveUnit(db, tenantId, HARARE_HEAVY_FLEET_ID);
    const deptUnit = await resolveUnit(db, tenantId, LOGISTICS_DEPARTMENT_ID);

    printUnitCheck('Vehicles + linked rows ->', HARARE_HEAVY_FLEET_ID, fleetUnit);
    printUnitCheck('Drivers ->', LOGISTICS_DEPARTMENT_ID, deptUnit);

    if (!fleetUnit || !deptUnit) {
      console.log('');
      console.error(
        `${RED}Aborting: one or both destination org units were not found (or are ` +
          `soft-deleted / belong to a different organization). Nothing was changed.${RESET}`
      );
      process.exit(1);
    }

    if (fleetUnit.name !== 'Harare Heavy Fleet') {
      console.log(
        `  ${YELLOW}warning:${RESET} unit ${HARARE_HEAVY_FLEET_ID} is named ` +
          `"${fleetUnit.name}", not "Harare Heavy Fleet" -- proceeding anyway ` +
          `since the id is what the app actually filters on, but double-check ` +
          `this is the unit you meant.`
      );
    }
    if (deptUnit.name !== 'Logistics Department') {
      console.log(
        `  ${YELLOW}warning:${RESET} unit ${LOGISTICS_DEPARTMENT_ID} is named ` +
          `"${deptUnit.name}", not "Logistics Department" -- proceeding anyway.`
      );
    }

    // ── STEP 1: vehicles + everything that follows them by plate ─────
    console.log('');
    console.log(`${BOLD}1. Vehicles${RESET}`);

    const vehicles = await db
      .collection('tblvehicles')
      .find({ tenantId, isDeleted: { $ne: true } })
      .sort({ license_plate: 1 })
      .toArray();

    let vehiclesMoved = 0;
    let vehiclesAlreadyCorrect = 0;
    const childCounts = new Map<string, number>(
      CHILD_COLLECTIONS_BY_PLATE.map((c) => [c, 0])
    );
    let childrenWithoutPlate = 0;

    for (const vehicle of vehicles) {
      const alreadyCorrect = vehicle.orgUnitId === HARARE_HEAVY_FLEET_ID;
      if (alreadyCorrect) {
        vehiclesAlreadyCorrect += 1;
      } else {
        vehiclesMoved += 1;
      }

      if (APPLY && !alreadyCorrect) {
        await db
          .collection('tblvehicles')
          .updateOne(
            { _id: vehicle._id },
            { $set: { orgUnitId: HARARE_HEAVY_FLEET_ID, updatedAt: new Date() } }
          );
      }

      const plate = vehicle.license_plate;
      if (!plate) continue;

      for (const coll of CHILD_COLLECTIONS_BY_PLATE) {
        const filter = { tenantId, license_plate: plate };
        const count = await db.collection(coll).countDocuments(filter);
        childCounts.set(coll, (childCounts.get(coll) ?? 0) + count);
        if (APPLY && count > 0) {
          await db
            .collection(coll)
            .updateMany(filter, { $set: { orgUnitId: HARARE_HEAVY_FLEET_ID, updatedAt: new Date() } });
        }
      }
    }

    console.log(
      `  vehicles: ${CYAN}${vehiclesMoved}${RESET} moved, ` +
        `${DIM}${vehiclesAlreadyCorrect} already on Harare Heavy Fleet${RESET}`
    );
    for (const coll of CHILD_COLLECTIONS_BY_PLATE) {
      console.log(`  ${coll.padEnd(14)} ${CYAN}${childCounts.get(coll)}${RESET} rows matched by plate`);
    }

    // Fallback: any row in the child collections that has NO
    // license_plate at all (so the loop above never reached it) still
    // needs a home. Rather than leave it on a stale Bulawayo id, park
    // it on Harare Heavy Fleet too -- consistent with "all data belongs
    // to Harare".
    console.log('');
    console.log(`${BOLD}2. Rows with no license_plate (fallback)${RESET}`);
    for (const coll of CHILD_COLLECTIONS_BY_PLATE) {
      const filter = {
        tenantId,
        $or: [{ license_plate: { $exists: false } }, { license_plate: null }, { license_plate: '' }],
      };
      const count = await db.collection(coll).countDocuments(filter);
      childrenWithoutPlate += count;
      if (count > 0) {
        console.log(`  ${coll.padEnd(14)} ${YELLOW}${count}${RESET} row(s) without a plate`);
        if (APPLY) {
          await db
            .collection(coll)
            .updateMany(filter, { $set: { orgUnitId: HARARE_HEAVY_FLEET_ID, updatedAt: new Date() } });
        }
      }
    }
    if (childrenWithoutPlate === 0) {
      console.log(`  ${DIM}none -- every row matched a vehicle by plate${RESET}`);
    }

    // ── STEP 3: drivers ────────────────────────────────────────────────
    console.log('');
    console.log(`${BOLD}3. Drivers${RESET}`);

    const drivers = await db
      .collection('tbldrivers')
      .find({ tenantId, isDeleted: { $ne: true } })
      .toArray();

    let driversMoved = 0;
    let driversAlreadyCorrect = 0;

    for (const driver of drivers) {
      const alreadyCorrect = driver.orgUnitId === LOGISTICS_DEPARTMENT_ID;
      if (alreadyCorrect) {
        driversAlreadyCorrect += 1;
        continue;
      }
      driversMoved += 1;
      if (APPLY) {
        await db
          .collection('tbldrivers')
          .updateOne(
            { _id: driver._id },
            { $set: { orgUnitId: LOGISTICS_DEPARTMENT_ID, updatedAt: new Date() } }
          );
      }
    }

    console.log(
      `  drivers: ${CYAN}${driversMoved}${RESET} moved, ` +
        `${DIM}${driversAlreadyCorrect} already on Logistics Department${RESET}`
    );

    // ── What was deliberately left alone ──────────────────────────────
    console.log('');
    console.log(`${BOLD}Untouched (by design)${RESET}`);
    console.log(`  ${DIM}tblorgunits                 -- hierarchy itself${RESET}`);
    console.log(`  ${DIM}tbluser_scope_assignments   -- who is assigned where${RESET}`);
    console.log(`  ${DIM}tblorganizations.members[]  -- roster${RESET}`);

    console.log('');
    if (!APPLY) {
      console.log(`${YELLOW}Dry run -- nothing written. Re-run with --confirm to apply.${RESET}`);
    } else {
      console.log(`${GREEN}Move applied.${RESET}`);
      console.log(`  npm run tenancy:sync-members    # verify the expected visibility matrix`);
    }
    console.log('');
  } finally {
    await client.close();
  }
}

async function resolveUnit(
  db: import('mongodb').Db,
  tenantId: string,
  id: string
): Promise<{ _id: unknown; name: string; type: string } | null> {
  if (!ObjectId.isValid(id)) return null;
  const unit = await db.collection('tblorgunits').findOne({
    _id: new ObjectId(id),
    organizationId: tenantId,
    isDeleted: { $ne: true },
  });
  if (!unit) return null;
  return { _id: unit._id, name: String(unit.name), type: String(unit.type) };
}

function printUnitCheck(
  label: string,
  id: string,
  unit: { name: string; type: string } | null
): void {
  if (!unit) {
    console.log(`  ${label.padEnd(28)} ${RED}${id} -- NOT FOUND${RESET}`);
    return;
  }
  console.log(`  ${label.padEnd(28)} ${GREEN}${unit.name}${RESET} ${DIM}(${unit.type}, ${id})${RESET}`);
}

main().catch((e) => {
  console.error(`${RED}Move failed:${RESET}`, e instanceof Error ? e.message : e);
  process.exit(1);
});
