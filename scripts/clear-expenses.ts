/**
 * Clear all existing expense types and expenses
 * 
 * Run with: npm run db:clear-expenses
 */

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function clearExpenses() {
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
    
    // Clear expense types
    const expenseTypesResult = await db.collection("tblexpense_types").deleteMany({});
    console.log(`🗑️ Deleted ${expenseTypesResult.deletedCount} expense types`);
    
    // Clear expenses
    const expensesResult = await db.collection("tblexpenses").deleteMany({});
    console.log(`🗑️ Deleted ${expensesResult.deletedCount} expenses`);
    
    console.log("\n✅ All expense data cleared!");
    
  } catch (error) {
    console.error("❌ Clear failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

clearExpenses();