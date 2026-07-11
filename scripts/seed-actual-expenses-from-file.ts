/**
 * Add actual expense records for all maintenance items
 * 
 * Run with: npm run db:seed-actual-expenses-from-file
 */

import { MongoClient, ObjectId } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Use vehicles from your database - modify these to match your actual vehicles
const VEHICLES = [
  "ABY5399",  // Replace with your actual vehicle
  "ABC1234",
  "XYZ5678",
];

// FIX: Add the organization's tenant ID - get this from your database
// Run this in MongoDB to find it:
// db.tblorganizations.findOne({ name: "Willsgrove Farm Enterprises" }, { _id: 1 })
const ORGANIZATION_TENANT_ID = process.env.ORGANIZATION_TENANT_ID || "default";

// Realistic costs for each type of repair
const getCostRange = (itemName: string): { min: number; max: number } => {
  if (itemName.includes("Engine overhaul") || itemName.includes("New Engine") || itemName.includes("New gear box")) {
    return { min: 2000, max: 8000 };
  }
  if (itemName.includes("transmission overheating") || itemName.includes("Engine coolant in motor oil")) {
    return { min: 500, max: 1500 };
  }
  if (itemName.includes("Cracked brake drums") || itemName.includes("Master cylinder leakage")) {
    return { min: 250, max: 600 };
  }
  if (itemName.includes("Tyre replacements")) {
    return { min: 300, max: 800 };
  }
  if (itemName.includes("alternator") || itemName.includes("starter")) {
    return { min: 250, max: 700 };
  }
  if (itemName.includes("Oil") || itemName.includes("fluid") || itemName.includes("lubricants")) {
    return { min: 50, max: 200 };
  }
  if (itemName.includes("inspection") || itemName.includes("check") || itemName.includes("adjust")) {
    return { min: 40, max: 150 };
  }
  return { min: 100, max: 400 };
};

// Helper function to get random date within last 6 months
function getRandomDate(): Date {
  const now = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(now.getMonth() - 6);
  
  const randomTimestamp = sixMonthsAgo.getTime() + Math.random() * (now.getTime() - sixMonthsAgo.getTime());
  return new Date(randomTimestamp);
}

// Helper function to get random vehicle
function getRandomVehicle(): string {
  return VEHICLES[Math.floor(Math.random() * VEHICLES.length)];
}

async function seedActualExpenses() {
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
    
    // Get all expense types
    const expenseTypes = await db.collection("tblexpense_types").find({}).toArray();
    console.log(`📋 Found ${expenseTypes.length} expense types`);
    
    // Create a map of name -> expense type
    const expenseTypeMap = new Map();
    expenseTypes.forEach(et => {
      expenseTypeMap.set(et.name, et);
    });

    const expensesCollection = db.collection("tblexpenses");
    
    // Create expense records - one for each expense type
    const expensesToInsert = [];
    
    for (const expenseType of expenseTypes) {
      const costRange = getCostRange(expenseType.name);
      const cost = Math.round((costRange.min + Math.random() * (costRange.max - costRange.min)) * 100) / 100;
      const date = getRandomDate();
      const vehicle = getRandomVehicle();
      
      expensesToInsert.push({
        license_plate: vehicle,
        amount: cost,
        date: date,
        expense_type_id: new ObjectId(expenseType._id),
        description: `${expenseType.name}`,
        notes: `Performed on ${vehicle} - ${date.toLocaleDateString()}`,
        tenantId: ORGANIZATION_TENANT_ID, // FIX: Add tenantId to match organization
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    console.log(`\n📝 Adding ${expensesToInsert.length} expense records...`);
    
    // Insert all expenses
    const result = await expensesCollection.insertMany(expensesToInsert);
    
    console.log(`\n✅ Successfully added ${result.insertedCount} expense records!`);
    
    // Show summary by category
    const summary: Record<string, { count: number; total: number }> = {};
    for (const exp of expensesToInsert) {
      const expenseType = expenseTypes.find(et => et._id.toString() === exp.expense_type_id.toString());
      const category = expenseType?.category || "Unknown";
      if (!summary[category]) summary[category] = { count: 0, total: 0 };
      summary[category].count++;
      summary[category].total += exp.amount;
    }
    
    console.log("\n📊 Summary by category:");
    for (const [category, data] of Object.entries(summary)) {
      console.log(`   ${category}: ${data.count} expenses, $${data.total.toFixed(2)} total`);
    }
    
    const totalAmount = expensesToInsert.reduce((sum, e) => sum + e.amount, 0);
    console.log(`\n💰 Total expenses value: $${totalAmount.toFixed(2)}`);
    console.log(`🚗 Vehicles used: ${[...new Set(expensesToInsert.map(e => e.license_plate))].join(", ")}`);
    
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seedActualExpenses();