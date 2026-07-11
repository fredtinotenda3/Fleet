/**
 * Fix existing expenses that are missing tenantId
 * Run with: node scripts/update-expenses-tenant.js
 */

import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FIX: Load .env file
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function fixExpenseTenants() {
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
    
    // Find the organization to get the correct tenantId
    const org = await db.collection("tblorganizations").findOne(
      { name: "Willsgrove Farm Enterprises" }
    );
    
    if (!org) {
      console.error("❌ Organization 'Willsgrove Farm Enterprises' not found");
      console.log("Available organizations:");
      const orgs = await db.collection("tblorganizations").find({}).toArray();
      orgs.forEach(o => console.log(`  - ${o.name} (${o._id})`));
      process.exit(1);
    }
    
    const tenantId = org._id.toString();
    console.log(`📋 Using tenantId: ${tenantId} for organization: ${org.name}`);
    
    // Update all expenses that are missing tenantId
    const result = await db.collection("tblexpenses").updateMany(
      { 
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
          { tenantId: "" }
        ],
        isDeleted: { $ne: true }
      },
      { 
        $set: { 
          tenantId: tenantId,
          updatedAt: new Date()
        } 
      }
    );
    
    console.log(`\n✅ Updated ${result.modifiedCount} expenses with tenantId: ${tenantId}`);
    console.log(`   Matched: ${result.matchedCount} documents`);
    
    // Verify the fix
    const stats = await db.collection("tblexpenses").aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: "$tenantId", count: { $sum: 1 }, total: { $sum: "$amount" } } }
    ]).toArray();
    
    console.log("\n📊 Expenses by tenant after fix:");
    stats.forEach(s => {
      console.log(`   Tenant ${s._id || 'missing'}: ${s.count} expenses, $${s.total.toFixed(2)}`);
    });
    
  } catch (error) {
    console.error("❌ Update failed:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

fixExpenseTenants();