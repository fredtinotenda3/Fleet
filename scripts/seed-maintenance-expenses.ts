/**
 * Seed script to add all maintenance items as expense types
 * 
 * Run with: npm run db:seed-maintenance-expenses
 */

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// All maintenance items organized by category
const MAINTENANCE_EXPENSES = [
  // 1. Braking System
  { name: "Airline leak or bulge", category: "Braking System", type: "repair" },
  { name: "Loose mounding bolts", category: "Braking System", type: "repair" },
  { name: "Evidence of oil seepage", category: "Braking System", type: "inspection" },
  { name: "Cracked brake drums", category: "Braking System", type: "repair" },
  { name: "Inoperative low air warning device", category: "Braking System", type: "repair" },
  { name: "Master cylinder leakage", category: "Braking System", type: "repair" },
  { name: "Check clutch pedal free travel", category: "Braking System", type: "inspection" },
  { name: "Adjust brakes", category: "Braking System", type: "service" },
  { name: "Check and adjust pedal free travel", category: "Braking System", type: "service" },
  { name: "Check master cylinder fluids", category: "Braking System", type: "fluid" },
  { name: "Exhaust leak forward or below gas", category: "Braking System", type: "repair" },

  // 2. Fuel System
  { name: "Visible fuel leak", category: "Fuel System", type: "repair" },
  { name: "Fuel tank repairs", category: "Fuel System", type: "repair" },
  { name: "Cooling system check", category: "Fuel System", type: "inspection" },

  // 3. Spring and Suspension
  { name: "Cracked or loose U bolt", category: "Spring & Suspension", type: "repair" },
  { name: "Broken main leaf spring", category: "Spring & Suspension", type: "repair" },
  { name: "Displaced leaf contacting tire", category: "Spring & Suspension", type: "repair" },
  { name: "Broken or missing shocks", category: "Spring & Suspension", type: "replacement" },
  { name: "Missing or broken axle bolts", category: "Spring & Suspension", type: "repair" },
  { name: "Drain and flush gear box", category: "Spring & Suspension", type: "service" },
  { name: "Refill with proper lubricants", category: "Spring & Suspension", type: "fluid" },
  { name: "Oil, brake fluid, shock absorber check", category: "Spring & Suspension", type: "inspection" },
  { name: "Steering joints torque check", category: "Spring & Suspension", type: "service" },
  { name: "Lubricate rear axle bearing", category: "Spring & Suspension", type: "service" },
  { name: "Tighten rear axle shaft nuts", category: "Spring & Suspension", type: "service" },
  { name: "Wheel alignment", category: "Spring & Suspension", type: "service" },
  { name: "Tyre replacement", category: "Spring & Suspension", type: "replacement" },
  { name: "Excessive free play check", category: "Spring & Suspension", type: "inspection" },
  { name: "Worn or faulty universal joints", category: "Spring & Suspension", type: "replacement" },
  { name: "Steering wheel securement", category: "Spring & Suspension", type: "repair" },
  { name: "Loose tire rod ends", category: "Spring & Suspension", type: "repair" },

  // 4. Auto Electricals
  { name: "Cracked or distorted lights", category: "Auto Electricals", type: "replacement" },
  { name: "Brake lights inoperative", category: "Auto Electricals", type: "repair" },
  { name: "Taillights inoperative", category: "Auto Electricals", type: "repair" },
  { name: "Turn signal inoperative", category: "Auto Electricals", type: "repair" },
  { name: "Inoperative siren", category: "Auto Electricals", type: "repair" },
  { name: "Emergency lighting not visible", category: "Auto Electricals", type: "repair" },
  { name: "Aim headlights", category: "Auto Electricals", type: "service" },
  { name: "Battery clean and tighten terminals", category: "Auto Electricals", type: "service" },
  { name: "Operation of all instruments", category: "Auto Electricals", type: "inspection" },
  { name: "Lights, horns and accessories check", category: "Auto Electricals", type: "inspection" },
  { name: "Adjust fan belt tension", category: "Auto Electricals", type: "service" },
  { name: "Coolant leak at water pump", category: "Auto Electricals", type: "repair" },
  { name: "Major coolant leak", category: "Auto Electricals", type: "repair" },
  { name: "Automatic transmission overheating", category: "Auto Electricals", type: "repair" },
  { name: "Defective clutch components", category: "Auto Electricals", type: "replacement" },
  { name: "Defective foot throttle", category: "Auto Electricals", type: "replacement" },
  { name: "Defective charging system", category: "Auto Electricals", type: "repair" },
  { name: "Alternator repair/replacement", category: "Auto Electricals", type: "replacement" },
  { name: "Starter motor repair/replacement", category: "Auto Electricals", type: "replacement" },

  // 5. Engine & Gear boxes
  { name: "Engine overhaul", category: "Engine & Gearbox", type: "major" },
  { name: "New engine installation", category: "Engine & Gearbox", type: "major" },
  { name: "New gearbox installation", category: "Engine & Gearbox", type: "major" },
  { name: "Engine coolant in motor oil", category: "Engine & Gearbox", type: "repair" },
  { name: "Tune engine including tappets", category: "Engine & Gearbox", type: "service" },
  { name: "Adjust ignition timing", category: "Engine & Gearbox", type: "service" },
  { name: "Oil change", category: "Engine & Gearbox", type: "service" },
  { name: "Filter replacements", category: "Engine & Gearbox", type: "replacement" },

  // 6. Cab / Body components
  { name: "Missing or broken mirrors", category: "Cab & Body", type: "replacement" },
  { name: "Defective doors", category: "Cab & Body", type: "repair" },
  { name: "Door hardware repair", category: "Cab & Body", type: "repair" },
  { name: "Glass replacement", category: "Cab & Body", type: "replacement" },
  { name: "Lock and key replacement", category: "Cab & Body", type: "replacement" },
  { name: "Body panel repair", category: "Cab & Body", type: "repair" },
];

async function seedMaintenanceExpenses() {
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

    // Check for duplicates
    const existingNames = new Set();
    const existing = await collection.find({}, { projection: { name: 1 } }).toArray();
    existing.forEach(e => existingNames.add(e.name.toLowerCase()));

    // Filter out items that already exist
    const newItems = MAINTENANCE_EXPENSES.filter(
      item => !existingNames.has(item.name.toLowerCase())
    );

    if (newItems.length === 0) {
      console.log("✅ All maintenance expense types already exist!");
      await client.close();
      return;
    }

    console.log(`📝 Adding ${newItems.length} new expense types...`);

    // Insert new expense types
    const result = await collection.insertMany(
      newItems.map((item, index) => ({
        name: item.name,
        category: item.category,
        type: item.type,
        description: `${item.category} - ${item.type}`,
        isDeleted: false,
        createdAt: new Date(),
        sortOrder: existingCount + index,
      }))
    );

    console.log(`\n✅ Inserted ${result.insertedCount} expense types:`);
    
    // Group by category for display
    const grouped = newItems.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item.name);
      return acc;
    }, {} as Record<string, string[]>);

    for (const [category, items] of Object.entries(grouped)) {
      console.log(`\n📁 ${category}:`);
      items.forEach(item => console.log(`   - ${item}`));
    }

    console.log(`\n🎉 Total expense types now: ${existingCount + result.insertedCount}`);
    
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seedMaintenanceExpenses();