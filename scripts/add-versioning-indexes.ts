// scripts/add-versioning-indexes.ts
// Optional: Add indexes for version tracking if needed

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function addVersioningIndexes() {
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

    // This collection can store version usage analytics if needed
    const collection = db.collection("tblapi_version_usage");

    await collection.createIndexes([
      {
        key: { version: 1, timestamp: -1 },
        name: "idx_version_usage_version_timestamp",
      },
      {
        key: { tenantId: 1, version: 1 },
        name: "idx_version_usage_tenant_version",
      },
      {
        key: { timestamp: -1 },
        name: "idx_version_usage_timestamp",
      },
    ]);

    console.log("✅ Versioning indexes created");

  } catch (error) {
    console.error("❌ Failed to create indexes:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

addVersioningIndexes().catch(console.error);