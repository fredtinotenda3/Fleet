/**
 * Cascade delete script - Deletes a vehicle and all related records
 * 
 * Run with: npm run db:delete-vehicle ABY5399
 * Or delete all vehicles: npm run db:delete-all-vehicles -- --force
 */

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Parse command line arguments
const args = process.argv.slice(2);
const licensePlate = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
const deleteAll = args.includes("--all") || args.includes("-a");
const force = args.includes("--force") || args.includes("-f");

interface DeleteResult {
  vehicle: { deleted: boolean; licensePlate?: string };
  expenses: number;
  fuelLogs: number;
  meterLogs: number;
  reminders: number;
  trips: number;
}

async function deleteVehicleAndRelated(plate: string): Promise<DeleteResult> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("❌ MONGODB_URI environment variable is not defined");
  }

  const client = new MongoClient(uri);
  const result: DeleteResult = {
    vehicle: { deleted: false, licensePlate: plate },
    expenses: 0,
    fuelLogs: 0,
    meterLogs: 0,
    reminders: 0,
    trips: 0,
  };

  try {
    await client.connect();
    console.log(`\n🚗 Deleting vehicle: ${plate}`);
    console.log("=".repeat(50));

    const db = client.db("VehicleExpense");
    const vehiclesCollection = db.collection("tblvehicles");
    const expensesCollection = db.collection("tblexpenses");
    const fuelLogsCollection = db.collection("tblfuellogs");
    const meterLogsCollection = db.collection("tblmeterlogs");
    const remindersCollection = db.collection("tblreminders");
    const tripsCollection = db.collection("tbltrips");

    // 1. Delete Expenses
    const expensesResult = await expensesCollection.deleteMany({
      license_plate: plate
    });
    result.expenses = expensesResult.deletedCount;
    console.log(`   ✓ Deleted ${result.expenses} expenses`);

    // 2. Delete Fuel Logs
    const fuelLogsResult = await fuelLogsCollection.deleteMany({
      license_plate: plate
    });
    result.fuelLogs = fuelLogsResult.deletedCount;
    console.log(`   ✓ Deleted ${result.fuelLogs} fuel logs`);

    // 3. Delete Meter Logs
    const meterLogsResult = await meterLogsCollection.deleteMany({
      license_plate: plate
    });
    result.meterLogs = meterLogsResult.deletedCount;
    console.log(`   ✓ Deleted ${result.meterLogs} meter logs`);

    // 4. Delete Reminders/Services
    const remindersResult = await remindersCollection.deleteMany({
      license_plate: plate
    });
    result.reminders = remindersResult.deletedCount;
    console.log(`   ✓ Deleted ${result.reminders} service reminders`);

    // 5. Delete Trips
    const tripsResult = await tripsCollection.deleteMany({
      license_plate: plate
    });
    result.trips = tripsResult.deletedCount;
    console.log(`   ✓ Deleted ${result.trips} trips`);

    // 6. Delete Vehicle
    const vehicleResult = await vehiclesCollection.deleteOne({
      license_plate: plate
    });
    
    if (vehicleResult.deletedCount > 0) {
      result.vehicle.deleted = true;
      console.log(`   ✓ Deleted vehicle: ${plate}`);
    } else {
      console.log(`   ⚠️ Vehicle not found: ${plate}`);
    }

    return result;
  } catch (error) {
    console.error(`❌ Error deleting vehicle ${plate}:`, error);
    throw error;
  } finally {
    await client.close();
  }
}

async function deleteAllVehicles() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI environment variable is not defined");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("\n🗑️ DELETING ALL VEHICLES AND RELATED DATA");
    console.log("=".repeat(50));

    const db = client.db("VehicleExpense");
    
    // Get all vehicles first
    const vehicles = await db.collection("tblvehicles").find({}).toArray();
    
    if (vehicles.length === 0) {
      console.log("\n📋 No vehicles found to delete.");
      return;
    }
    
    console.log(`\n📋 Found ${vehicles.length} vehicles to delete\n`);

    let totalExpenses = 0;
    let totalFuelLogs = 0;
    let totalMeterLogs = 0;
    let totalReminders = 0;
    let totalTrips = 0;
    const deletedPlates: string[] = [];

    for (const vehicle of vehicles) {
      const plate = vehicle.license_plate;
      
      // Delete related data
      const expensesResult = await db.collection("tblexpenses").deleteMany({ license_plate: plate });
      const fuelLogsResult = await db.collection("tblfuellogs").deleteMany({ license_plate: plate });
      const meterLogsResult = await db.collection("tblmeterlogs").deleteMany({ license_plate: plate });
      const remindersResult = await db.collection("tblreminders").deleteMany({ license_plate: plate });
      const tripsResult = await db.collection("tbltrips").deleteMany({ license_plate: plate });
      
      totalExpenses += expensesResult.deletedCount || 0;
      totalFuelLogs += fuelLogsResult.deletedCount || 0;
      totalMeterLogs += meterLogsResult.deletedCount || 0;
      totalReminders += remindersResult.deletedCount || 0;
      totalTrips += tripsResult.deletedCount || 0;
      deletedPlates.push(plate);
      
      console.log(`   ✓ ${plate}: ${expensesResult.deletedCount} expenses, ${fuelLogsResult.deletedCount} fuel, ${meterLogsResult.deletedCount} meter, ${remindersResult.deletedCount} reminders, ${tripsResult.deletedCount} trips`);
    }

    // Delete all vehicles
    const vehicleResult = await db.collection("tblvehicles").deleteMany({});
    
    console.log("\n" + "=".repeat(50));
    console.log("📊 DELETION SUMMARY");
    console.log("=".repeat(50));
    console.log(`   🚗 Vehicles deleted: ${vehicleResult.deletedCount}`);
    console.log(`   📋 License plates: ${deletedPlates.join(", ")}`);
    console.log(`   💰 Expenses deleted: ${totalExpenses}`);
    console.log(`   ⛽ Fuel logs deleted: ${totalFuelLogs}`);
    console.log(`   📊 Meter logs deleted: ${totalMeterLogs}`);
    console.log(`   🔧 Service reminders deleted: ${totalReminders}`);
    console.log(`   🗺️ Trips deleted: ${totalTrips}`);
    console.log("\n✅ All vehicles and related data have been deleted!");

  } catch (error) {
    console.error("❌ Error deleting all vehicles:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

async function main() {
  // Check if force flag is required for delete-all
  if (deleteAll && !force) {
    console.log("\n⚠️ WARNING: This will delete ALL vehicles and ALL related data!");
    console.log("   This action cannot be undone.");
    console.log("\n   To proceed, use the --force flag:");
    console.log("   npm run db:delete-all-vehicles -- --force");
    console.log("\n   Or to delete a single vehicle:");
    console.log("   npm run db:delete-vehicle ABY5399\n");
    process.exit(1);
  }
  
  // Confirmation for single vehicle delete
  if (licensePlate && !force) {
    console.log("\n⚠️ WARNING: This will delete vehicle and ALL related data!");
    console.log(`   Vehicle: ${licensePlate}`);
    console.log("   This action cannot be undone.");
    console.log("\n   To proceed, use the --force flag:");
    console.log(`   npm run db:delete-vehicle ${licensePlate} -- --force\n`);
    process.exit(1);
  }
  
  if (deleteAll && force) {
    await deleteAllVehicles();
  } else if (licensePlate && force) {
    const result = await deleteVehicleAndRelated(licensePlate);
    
    console.log("\n" + "=".repeat(50));
    console.log("📊 DELETION SUMMARY");
    console.log("=".repeat(50));
    console.log(`   🚗 Vehicle: ${result.vehicle.deleted ? "✓ Deleted" : "✗ Not found"}`);
    console.log(`   💰 Expenses: ${result.expenses}`);
    console.log(`   ⛽ Fuel logs: ${result.fuelLogs}`);
    console.log(`   📊 Meter logs: ${result.meterLogs}`);
    console.log(`   🔧 Service reminders: ${result.reminders}`);
    console.log(`   🗺️ Trips: ${result.trips}`);
    console.log("\n✅ Vehicle and all related data deleted successfully!");
  } else if (licensePlate && !force) {
    // Already handled above
  } else {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    CASCADE DELETE TOOL                       ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  Delete a single vehicle:
    npm run db:delete-vehicle <license_plate> -- --force

  Delete ALL vehicles:
    npm run db:delete-all-vehicles -- --force

Examples:
  npm run db:delete-vehicle ABY5399 -- --force
  npm run db:delete-all-vehicles -- --force

⚠️  WARNING: This permanently deletes all related data (expenses, 
   fuel logs, meter logs, service reminders, and trips)!
`);
  }
}

main().catch(console.error);