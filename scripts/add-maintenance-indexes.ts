/**
 * Script to add indexes for the new maintenance category and priority fields
 * 
 * Run with: npx ts-node scripts/add-maintenance-indexes.ts
 */

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function addMaintenanceIndexes() {
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
    const collection = db.collection("tblreminders");

    console.log("\n📋 Adding indexes for maintenance fields...");

    // Index for category filtering
    await collection.createIndex(
      { category: 1 },
      { name: "idx_reminder_category" }
    );
    console.log("✅ Created index: idx_reminder_category");

    // Index for priority filtering
    await collection.createIndex(
      { priority: 1 },
      { name: "idx_reminder_priority" }
    );
    console.log("✅ Created index: idx_reminder_priority");

    // Compound index for category + status (common dashboard query)
    await collection.createIndex(
      { category: 1, status: 1 },
      { name: "idx_reminder_category_status" }
    );
    console.log("✅ Created index: idx_reminder_category_status");

    // Compound index for priority + status
    await collection.createIndex(
      { priority: 1, status: 1 },
      { name: "idx_reminder_priority_status" }
    );
    console.log("✅ Created index: idx_reminder_priority_status");

    // Compound index for license_plate + category + status (vehicle-specific queries)
    await collection.createIndex(
      { license_plate: 1, category: 1, status: 1 },
      { name: "idx_reminder_plate_category_status" }
    );
    console.log("✅ Created index: idx_reminder_plate_category_status");

    // Index for estimated cost queries
    await collection.createIndex(
      { estimated_cost: 1 },
      { name: "idx_reminder_estimated_cost" }
    );
    console.log("✅ Created index: idx_reminder_estimated_cost");

    console.log("\n📊 Collection indexes after migration:");
    const indexes = await collection.indexes();
    indexes.forEach(idx => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log("\n✅ All maintenance indexes created successfully!");
    
  } catch (error) {
    console.error("❌ Failed to create indexes:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

addMaintenanceIndexes().catch(console.error);