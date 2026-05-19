/**
 * Seed script to populate expense types
 * 
 * Run with: npm run db:seed-expense-types
 */

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Define the expense types from your maintenance categories
const EXPENSE_TYPES = [
  { name: "Brake System Repair", category: "maintenance", description: "Brake pads, discs, drums, master cylinder" },
  { name: "Brake Fluid", category: "fluid", description: "Brake fluid replacement" },
  { name: "Airline Repair", category: "repair", description: "Airline leak or bulge repair" },
  
  { name: "Fuel System Repair", category: "maintenance", description: "Fuel leak, fuel tank repairs" },
  { name: "Fuel", category: "fuel", description: "Petrol, Diesel fuel purchases" },
  
  { name: "Suspension Repair", category: "maintenance", description: "Springs, shocks, U-bolts" },
  { name: "Wheel Alignment", category: "maintenance", description: "Wheel alignment service" },
  { name: "Tyre Replacement", category: "maintenance", description: "New tyres" },
  { name: "Tyre Repair", category: "repair", description: "Puncture repair" },
  
  { name: "Electrical Repair", category: "maintenance", description: "Lights, wiring, alternator" },
  { name: "Battery", category: "parts", description: "New battery" },
  { name: "Starter Motor", category: "parts", description: "Starter replacement" },
  { name: "Alternator", category: "parts", description: "Alternator replacement" },
  
  { name: "Engine Repair", category: "maintenance", description: "Engine repairs" },
  { name: "Engine Oil", category: "fluid", description: "Engine oil change" },
  { name: "Oil Filter", category: "parts", description: "Oil filter replacement" },
  { name: "Engine Overhaul", category: "major", description: "Complete engine overhaul" },
  
  { name: "Gearbox Repair", category: "maintenance", description: "Transmission repairs" },
  { name: "Gearbox Oil", category: "fluid", description: "Transmission fluid" },
  { name: "Clutch Repair", category: "maintenance", description: "Clutch replacement" },
  
  { name: "Cooling System", category: "maintenance", description: "Radiator, water pump, coolant" },
  { name: "Coolant", category: "fluid", description: "Engine coolant" },
  
  { name: "Body Repair", category: "repair", description: "Doors, mirrors, body panels" },
  { name: "Glass Replacement", category: "repair", description: "Windshield, windows" },
  
  { name: "General Service", category: "maintenance", description: "Regular vehicle service" },
  { name: "Inspection", category: "service", description: "Vehicle inspection" },
  { name: "Registration", category: "admin", description: "Vehicle registration fees" },
  { name: "Insurance", category: "admin", description: "Vehicle insurance" },
  { name: "Toll Fees", category: "operational", description: "Toll road charges" },
  { name: "Parking", category: "operational", description: "Parking fees" },
];

async function seedExpenseTypes() {
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
    const collection = db.collection("tblexpense_types");

    // Check existing count
    const existingCount = await collection.countDocuments();
    console.log(`📋 Existing expense types: ${existingCount}`);

    if (existingCount > 0) {
      console.log("⚠️ Expense types already exist. Skipping seed.");
      console.log("   To re-seed, run: db.tblexpense_types.deleteMany({}) first");
      
      // Show existing types
      const existing = await collection.find({}, { projection: { name: 1, category: 1 } }).toArray();
      console.log("\n📋 Existing types:");
      existing.forEach(t => console.log(`   - ${t.name} (${t.category})`));
      
      await client.close();
      return;
    }

    // Insert all expense types
    const result = await collection.insertMany(
      EXPENSE_TYPES.map((type, index) => ({
        ...type,
        isDeleted: false,
        createdAt: new Date(),
        sortOrder: index,
      }))
    );

    console.log(`\n✅ Inserted ${result.insertedCount} expense types:`);
    EXPENSE_TYPES.forEach(type => {
      console.log(`   - ${type.name} (${type.category})`);
    });

    console.log("\n🎉 Expense types seeded successfully!");
    
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seedExpenseTypes();