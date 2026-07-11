/**
 * Fix the 3 new expenses with wrong tenantId
 * Run with: node scripts/fix-new-expenses.js
 */

import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function fixNewExpenses() {
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
    
    // Get the organization's tenantId
    const org = await db.collection("tblorganizations").findOne(
      { name: "Willsgrove Farm Enterprises" }
    );
    
    if (!org) {
      console.error("❌ Organization not found");
      process.exit(1);
    }
    
    const correctTenantId = org._id.toString();
    
    // Update the 3 expenses with wrong tenantId
    const result = await db.collection("tblexpenses").updateMany(
      { tenantId: "default" },
      { 
        $set: { 
          tenantId: correctTenantId,
          updatedAt: new Date()
        } 
      }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} expenses from 'default' to '${correctTenantId}'`);
    
    // Verify
    const stats = await db.collection("tblexpenses").aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: "$tenantId", count: { $sum: 1 }, total: { $sum: "$amount" } } }
    ]).toArray();
    
    console.log("\n📊 Final state:");
    stats.forEach(s => {
      console.log(`   Tenant ${s._id}: ${s.count} expenses, $${s.total.toFixed(2)}`);
    });
    
  } catch (error) {
    console.error("❌ Fix failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

fixNewExpenses();