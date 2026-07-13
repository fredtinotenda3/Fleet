/** scripts/cascade-delete-vehicle.ts
 * Cascade delete script - Deletes a vehicle and all related records
 *
 * FIX (critical -- cross-tenant data corruption): every delete in this
 * script previously matched on `license_plate` ALONE, with no tenantId
 * filter. The app's own schema proves plates are only unique PER TENANT
 * (see idx_vehicle_tenant_plate: {tenantId, license_plate} in
 * infrastructure/database/indexes.ts) -- meaning two different tenants
 * can legitimately have a vehicle with the same plate. Running this
 * script for one tenant's "ABY5399" would also silently hard-delete a
 * different tenant's unrelated "ABY5399" and every one of its expenses,
 * fuel logs, meter logs, reminders, and trips. That is irreversible
 * cross-tenant data loss, not a hypothetical edge case, given this is a
 * multi-tenant fleet platform.
 *
 * The script now REQUIRES an explicit `--tenant=<id>` for single-vehicle
 * deletes, or an explicit `--all-tenants` opt-in for the delete-all path,
 * mirroring the existing `--force` confirmation pattern. There is no
 * silent "match everywhere" default.
 *
 * Run with:
 *   npm run db:delete-vehicle ABY5399 -- --tenant=<tenantId> --force
 *   npm run db:delete-all-vehicles -- --tenant=<tenantId> --force        (single tenant)
 *   npm run db:delete-all-vehicles -- --all-tenants --force              (every tenant, explicit opt-in)
 */

import { MongoClient, Filter, Document } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// ── Argument parsing ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const licensePlate = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
const deleteAll = args.includes("--all") || args.includes("-a");
const force = args.includes("--force") || args.includes("-f");
const allTenants = args.includes("--all-tenants");

const tenantArg = args.find((a) => a.startsWith("--tenant="));
const tenantId = tenantArg ? tenantArg.split("=")[1]?.trim() : undefined;

interface DeleteResult {
  vehicle: { deleted: boolean; licensePlate?: string; tenantId?: string };
  expenses: number;
  fuelLogs: number;
  meterLogs: number;
  reminders: number;
  trips: number;
}

/**
 * Every plate-scoped filter in this script MUST go through this helper.
 * There is deliberately no code path that builds a plate-only filter
 * without a tenantId, short of the explicit --all-tenants opt-in below.
 */
function buildPlateFilter(plate: string, tenant: string): Filter<Document> {
  return { license_plate: plate, tenantId: tenant };
}

async function deleteVehicleAndRelated(
  plate: string,
  tenant: string
): Promise<DeleteResult> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("❌ MONGODB_URI environment variable is not defined");
  }

  const client = new MongoClient(uri);
  const result: DeleteResult = {
    vehicle: { deleted: false, licensePlate: plate, tenantId: tenant },
    expenses: 0,
    fuelLogs: 0,
    meterLogs: 0,
    reminders: 0,
    trips: 0,
  };

  try {
    await client.connect();
    console.log(`\n🚗 Deleting vehicle: ${plate} (tenant: ${tenant})`);
    console.log("=".repeat(50));

    const db = client.db("VehicleExpense");
    const vehiclesCollection = db.collection("tblvehicles");
    const expensesCollection = db.collection("tblexpenses");
    const fuelLogsCollection = db.collection("tblfuellogs");
    const meterLogsCollection = db.collection("tblmeterlogs");
    const remindersCollection = db.collection("tblreminders");
    const tripsCollection = db.collection("tbltrips");

    const filter = buildPlateFilter(plate, tenant);

    // 1. Delete Expenses
    const expensesResult = await expensesCollection.deleteMany(filter);
    result.expenses = expensesResult.deletedCount;
    console.log(`   ✓ Deleted ${result.expenses} expenses`);

    // 2. Delete Fuel Logs
    const fuelLogsResult = await fuelLogsCollection.deleteMany(filter);
    result.fuelLogs = fuelLogsResult.deletedCount;
    console.log(`   ✓ Deleted ${result.fuelLogs} fuel logs`);

    // 3. Delete Meter Logs
    const meterLogsResult = await meterLogsCollection.deleteMany(filter);
    result.meterLogs = meterLogsResult.deletedCount;
    console.log(`   ✓ Deleted ${result.meterLogs} meter logs`);

    // 4. Delete Reminders/Services
    const remindersResult = await remindersCollection.deleteMany(filter);
    result.reminders = remindersResult.deletedCount;
    console.log(`   ✓ Deleted ${result.reminders} service reminders`);

    // 5. Delete Trips
    const tripsResult = await tripsCollection.deleteMany(filter);
    result.trips = tripsResult.deletedCount;
    console.log(`   ✓ Deleted ${result.trips} trips`);

    // 6. Delete Vehicle
    const vehicleResult = await vehiclesCollection.deleteOne(filter);

    if (vehicleResult.deletedCount > 0) {
      result.vehicle.deleted = true;
      console.log(`   ✓ Deleted vehicle: ${plate}`);
    } else {
      console.log(`   ⚠️ Vehicle not found for tenant "${tenant}": ${plate}`);
      console.log(
        `      (If this plate exists under a different tenant, it was NOT touched -- this is intentional.)`
      );
    }

    return result;
  } catch (error) {
    console.error(`❌ Error deleting vehicle ${plate}:`, error);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * Deletes every vehicle for a SINGLE tenant, and its related records,
 * scoped to that tenant throughout. This is the safe default when
 * "delete all vehicles" is requested without --all-tenants.
 */
async function deleteAllVehiclesForTenant(tenant: string) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI environment variable is not defined");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log(`\n🗑️ DELETING ALL VEHICLES FOR TENANT "${tenant}"`);
    console.log("=".repeat(50));

    const db = client.db("VehicleExpense");
    const tenantFilter = { tenantId: tenant };

    const vehicles = await db
      .collection("tblvehicles")
      .find(tenantFilter)
      .toArray();

    if (vehicles.length === 0) {
      console.log(`\n📋 No vehicles found for tenant "${tenant}".`);
      return;
    }

    console.log(`\n📋 Found ${vehicles.length} vehicles to delete for this tenant\n`);

    let totalExpenses = 0;
    let totalFuelLogs = 0;
    let totalMeterLogs = 0;
    let totalReminders = 0;
    let totalTrips = 0;
    const deletedPlates: string[] = [];

    for (const vehicle of vehicles) {
      const plate = vehicle.license_plate;
      const filter = buildPlateFilter(plate, tenant);

      const expensesResult = await db.collection("tblexpenses").deleteMany(filter);
      const fuelLogsResult = await db.collection("tblfuellogs").deleteMany(filter);
      const meterLogsResult = await db.collection("tblmeterlogs").deleteMany(filter);
      const remindersResult = await db.collection("tblreminders").deleteMany(filter);
      const tripsResult = await db.collection("tbltrips").deleteMany(filter);

      totalExpenses += expensesResult.deletedCount || 0;
      totalFuelLogs += fuelLogsResult.deletedCount || 0;
      totalMeterLogs += meterLogsResult.deletedCount || 0;
      totalReminders += remindersResult.deletedCount || 0;
      totalTrips += tripsResult.deletedCount || 0;
      deletedPlates.push(plate);

      console.log(
        `   ✓ ${plate}: ${expensesResult.deletedCount} expenses, ${fuelLogsResult.deletedCount} fuel, ${meterLogsResult.deletedCount} meter, ${remindersResult.deletedCount} reminders, ${tripsResult.deletedCount} trips`
      );
    }

    // Delete vehicles, scoped to this tenant only.
    const vehicleResult = await db.collection("tblvehicles").deleteMany(tenantFilter);

    console.log("\n" + "=".repeat(50));
    console.log("📊 DELETION SUMMARY");
    console.log("=".repeat(50));
    console.log(`   🏢 Tenant: ${tenant}`);
    console.log(`   🚗 Vehicles deleted: ${vehicleResult.deletedCount}`);
    console.log(`   📋 License plates: ${deletedPlates.join(", ")}`);
    console.log(`   💰 Expenses deleted: ${totalExpenses}`);
    console.log(`   ⛽ Fuel logs deleted: ${totalFuelLogs}`);
    console.log(`   📊 Meter logs deleted: ${totalMeterLogs}`);
    console.log(`   🔧 Service reminders deleted: ${totalReminders}`);
    console.log(`   🗺️ Trips deleted: ${totalTrips}`);
    console.log(`\n✅ All vehicles and related data for tenant "${tenant}" have been deleted!`);
  } catch (error) {
    console.error("❌ Error deleting vehicles for tenant:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

/**
 * Deletes vehicles and related data across EVERY tenant. Only reachable
 * via the explicit --all-tenants flag, on top of --force. This is the
 * one place the script intentionally has no tenant filter, because the
 * operator has explicitly said "yes, every tenant" rather than it being
 * an accidental default.
 */
async function deleteAllVehiclesAllTenants() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI environment variable is not defined");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("\n🗑️ DELETING ALL VEHICLES ACROSS ALL TENANTS");
    console.log("=".repeat(50));

    const db = client.db("VehicleExpense");

    const vehicles = await db.collection("tblvehicles").find({}).toArray();

    if (vehicles.length === 0) {
      console.log("\n📋 No vehicles found to delete.");
      return;
    }

    console.log(`\n📋 Found ${vehicles.length} vehicles across all tenants\n`);

    let totalExpenses = 0;
    let totalFuelLogs = 0;
    let totalMeterLogs = 0;
    let totalReminders = 0;
    let totalTrips = 0;
    const deletedPlates: string[] = [];

    for (const vehicle of vehicles) {
      const plate = vehicle.license_plate;
      const vehicleTenantId = vehicle.tenantId;

      // Still scope by tenantId even in the all-tenants path, per
      // vehicle -- this guarantees that even here, a delete for one
      // vehicle's tenant can never touch a different tenant's
      // same-plate records. The "all tenants" behavior comes from
      // iterating every vehicle, not from an unscoped filter.
      const filter = vehicleTenantId
        ? buildPlateFilter(plate, vehicleTenantId)
        : { license_plate: plate, tenantId: { $exists: false } };

      const expensesResult = await db.collection("tblexpenses").deleteMany(filter);
      const fuelLogsResult = await db.collection("tblfuellogs").deleteMany(filter);
      const meterLogsResult = await db.collection("tblmeterlogs").deleteMany(filter);
      const remindersResult = await db.collection("tblreminders").deleteMany(filter);
      const tripsResult = await db.collection("tbltrips").deleteMany(filter);

      totalExpenses += expensesResult.deletedCount || 0;
      totalFuelLogs += fuelLogsResult.deletedCount || 0;
      totalMeterLogs += meterLogsResult.deletedCount || 0;
      totalReminders += remindersResult.deletedCount || 0;
      totalTrips += tripsResult.deletedCount || 0;
      deletedPlates.push(`${plate} (${vehicleTenantId ?? "no-tenant"})`);

      console.log(
        `   ✓ ${plate} [${vehicleTenantId ?? "no-tenant"}]: ${expensesResult.deletedCount} expenses, ${fuelLogsResult.deletedCount} fuel, ${meterLogsResult.deletedCount} meter, ${remindersResult.deletedCount} reminders, ${tripsResult.deletedCount} trips`
      );
    }

    const vehicleResult = await db.collection("tblvehicles").deleteMany({});

    console.log("\n" + "=".repeat(50));
    console.log("📊 DELETION SUMMARY (ALL TENANTS)");
    console.log("=".repeat(50));
    console.log(`   🚗 Vehicles deleted: ${vehicleResult.deletedCount}`);
    console.log(`   📋 License plates: ${deletedPlates.join(", ")}`);
    console.log(`   💰 Expenses deleted: ${totalExpenses}`);
    console.log(`   ⛽ Fuel logs deleted: ${totalFuelLogs}`);
    console.log(`   📊 Meter logs deleted: ${totalMeterLogs}`);
    console.log(`   🔧 Service reminders deleted: ${totalReminders}`);
    console.log(`   🗺️ Trips deleted: ${totalTrips}`);
    console.log("\n✅ All vehicles and related data have been deleted across all tenants!");
  } catch (error) {
    console.error("❌ Error deleting all vehicles:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

function printUsage() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    CASCADE DELETE TOOL                       ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  Delete a single vehicle (tenant REQUIRED):
    npm run db:delete-vehicle <license_plate> -- --tenant=<tenantId> --force

  Delete ALL vehicles for ONE tenant:
    npm run db:delete-all-vehicles -- --tenant=<tenantId> --force

  Delete ALL vehicles across EVERY tenant (explicit opt-in required):
    npm run db:delete-all-vehicles -- --all-tenants --force

Examples:
  npm run db:delete-vehicle ABY5399 -- --tenant=acme-corp --force
  npm run db:delete-all-vehicles -- --tenant=acme-corp --force
  npm run db:delete-all-vehicles -- --all-tenants --force

⚠️  WARNING: This permanently deletes all related data (expenses,
   fuel logs, meter logs, service reminders, and trips)!

⚠️  Vehicles are looked up by (tenantId + license_plate). A plate is only
   unique WITHIN a tenant -- two tenants may legitimately share a plate.
   Without --tenant or --all-tenants, this script refuses to run rather
   than risk deleting the wrong tenant's data.
`);
}

async function main() {
  // ── Single vehicle delete ────────────────────────────────────────
  if (licensePlate) {
    if (!tenantId) {
      console.log(
        "\n❌ ERROR: --tenant=<tenantId> is required when deleting a single vehicle."
      );
      console.log(
        "   License plates are only unique PER TENANT -- without a tenant,"
      );
      console.log(
        "   this script cannot safely determine which vehicle you mean."
      );
      printUsage();
      process.exit(1);
    }

    if (!force) {
      console.log("\n⚠️ WARNING: This will delete vehicle and ALL related data!");
      console.log(`   Vehicle: ${licensePlate}`);
      console.log(`   Tenant: ${tenantId}`);
      console.log("   This action cannot be undone.");
      console.log("\n   To proceed, use the --force flag:");
      console.log(
        `   npm run db:delete-vehicle ${licensePlate} -- --tenant=${tenantId} --force\n`
      );
      process.exit(1);
    }

    const result = await deleteVehicleAndRelated(licensePlate, tenantId);

    console.log("\n" + "=".repeat(50));
    console.log("📊 DELETION SUMMARY");
    console.log("=".repeat(50));
    console.log(`   🚗 Vehicle: ${result.vehicle.deleted ? "✓ Deleted" : "✗ Not found"}`);
    console.log(`   🏢 Tenant: ${tenantId}`);
    console.log(`   💰 Expenses: ${result.expenses}`);
    console.log(`   ⛽ Fuel logs: ${result.fuelLogs}`);
    console.log(`   📊 Meter logs: ${result.meterLogs}`);
    console.log(`   🔧 Service reminders: ${result.reminders}`);
    console.log(`   🗺️ Trips: ${result.trips}`);
    console.log("\n✅ Vehicle and all related data deleted successfully!");
    return;
  }

  // ── Delete-all path ──────────────────────────────────────────────
  if (deleteAll) {
    if (!tenantId && !allTenants) {
      console.log(
        "\n❌ ERROR: delete-all requires either --tenant=<tenantId> (single tenant)"
      );
      console.log(
        "   or --all-tenants (explicit opt-in to affect every tenant)."
      );
      printUsage();
      process.exit(1);
    }

    if (tenantId && allTenants) {
      console.log(
        "\n❌ ERROR: pass either --tenant=<tenantId> OR --all-tenants, not both."
      );
      process.exit(1);
    }

    if (!force) {
      if (allTenants) {
        console.log(
          "\n⚠️ WARNING: This will delete ALL vehicles for EVERY TENANT and ALL related data!"
        );
      } else {
        console.log(
          `\n⚠️ WARNING: This will delete ALL vehicles for tenant "${tenantId}" and ALL related data!`
        );
      }
      console.log("   This action cannot be undone.");
      console.log("\n   To proceed, use the --force flag:");
      if (allTenants) {
        console.log("   npm run db:delete-all-vehicles -- --all-tenants --force\n");
      } else {
        console.log(
          `   npm run db:delete-all-vehicles -- --tenant=${tenantId} --force\n`
        );
      }
      process.exit(1);
    }

    if (allTenants) {
      await deleteAllVehiclesAllTenants();
    } else {
      await deleteAllVehiclesForTenant(tenantId as string);
    }
    return;
  }

  // ── No arguments ─────────────────────────────────────────────────
  printUsage();
}

main().catch(console.error);