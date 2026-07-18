// scripts/clear-drivers.ts
//
// Clears ALL documents from the tbldrivers collection.
// Use this before re-importing a clean set of drivers with
// unique identifiers (driver_code) to resolve ambiguous name
// matching in the backfill script.

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function clearDrivers() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI environment variable is not defined");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("VehicleExpense");

    // Only delete drivers, NOT fuel logs
    const result = await db.collection("tbldrivers").deleteMany({});
    console.log(`🗑️ Deleted ${result.deletedCount} drivers from tbldrivers`);

    console.log("✅ All driver data cleared. You can now import unique drivers.");
  } catch (error) {
    console.error("❌ Clear failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

clearDrivers();