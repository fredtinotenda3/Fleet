/**
 * Seed expense types from Motor Vehicle Maintenance file
 * 
 * Run with: npm run db:seed-expense-types-from-file
 */

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// ALL maintenance items from your file - EXACTLY as written
const EXPENSE_TYPES = [
  // 1. Braking system
  { name: "Airline leak or bulge", category: "Braking System", type: "repair" },
  { name: "Loose mounding bolts", category: "Braking System", type: "repair" },
  { name: "Evidence of oil seepage", category: "Braking System", type: "inspection" },
  { name: "Cracked brake drums", category: "Braking System", type: "repair" },
  { name: "Inoperative low air warning device", category: "Braking System", type: "repair" },
  { name: "Master cylinder leakage", category: "Braking System", type: "repair" },
  { name: "Check clutch pedal free travel and linkage", category: "Braking System", type: "inspection" },
  { name: "Adjust brakes", category: "Braking System", type: "service" },
  { name: "Check and adjust pedal free travel", category: "Braking System", type: "service" },
  { name: "Check master cylinder fluids", category: "Braking System", type: "inspection" },
  { name: "Exhaust leak forward or below the gas", category: "Braking System", type: "repair" },

  // 2. Fuel system
  { name: "Visible fuel leak", category: "Fuel System", type: "repair" },
  { name: "Fuel tank repairs", category: "Fuel System", type: "repair" },
  { name: "Cooling system", category: "Fuel System", type: "inspection" },

  // 3. Spring and suspension
  { name: "Cracked, loose or missing U bolt or other spring to axle clamp", category: "Spring & Suspension", type: "repair" },
  { name: "Any broken main leaf in the leaf spring", category: "Spring & Suspension", type: "repair" },
  { name: "Any displaced leaf that could result in contact with tire", category: "Spring & Suspension", type: "repair" },
  { name: "Broken or missing shocks", category: "Spring & Suspension", type: "replacement" },
  { name: "Missing or broken axle bolts", category: "Spring & Suspension", type: "repair" },
  { name: "Drain drum, gear box and axle, flush and refill with proper lubricants", category: "Spring & Suspension", type: "service" },
  { name: "Oil, brake fluid, shock absorber", category: "Spring & Suspension", type: "inspection" },
  { name: "Steering joints, U bolts and chassis bolts to torque specifications", category: "Spring & Suspension", type: "service" },
  { name: "Lubricate rear axle bearing. Tighten rear axle shaft nuts", category: "Spring & Suspension", type: "service" },
  { name: "Check wheel alignment", category: "Spring & Suspension", type: "service" },
  { name: "Tyre replacements", category: "Spring & Suspension", type: "replacement" },
  { name: "Excessive free play", category: "Spring & Suspension", type: "inspection" },
  { name: "Worn or faulty universal joints", category: "Spring & Suspension", type: "replacement" },
  { name: "Steering wheel not properly secured", category: "Spring & Suspension", type: "repair" },
  { name: "Loose tire rod ends", category: "Spring & Suspension", type: "repair" },

  // 4. Auto Electricals
  { name: "Visuals cracks or distortion that impair or inoperative", category: "Auto Electricals", type: "inspection" },
  { name: "Both brake lights missing or inoperative", category: "Auto Electricals", type: "repair" },
  { name: "Both taillights missing or inoperative", category: "Auto Electricals", type: "repair" },
  { name: "Any turn signal missing or inoperative", category: "Auto Electricals", type: "repair" },
  { name: "Inoperative siren", category: "Auto Electricals", type: "repair" },
  { name: "Emergency lighting not visible from all sides", category: "Auto Electricals", type: "repair" },
  { name: "Aim headlights", category: "Auto Electricals", type: "service" },
  { name: "Battery, clean and tighten terminals", category: "Auto Electricals", type: "service" },
  { name: "Operation of all instruments, lights horns and accessories", category: "Auto Electricals", type: "inspection" },
  { name: "Adjust fan belt tension", category: "Auto Electricals", type: "service" },
  { name: "Coolant leak at water pump", category: "Auto Electricals", type: "repair" },
  { name: "Any major coolant leak", category: "Auto Electricals", type: "repair" },
  { name: "Automatic transmission overheating", category: "Auto Electricals", type: "repair" },
  { name: "Defective clutch components", category: "Auto Electricals", type: "replacement" },
  { name: "Defective foot throttle", category: "Auto Electricals", type: "replacement" },
  { name: "Defective charging system", category: "Auto Electricals", type: "repair" },
  { name: "Any major alternator, starter", category: "Auto Electricals", type: "replacement" },

  // 5. Engine & Gear boxes
  { name: "Engine overhaul", category: "Engine & Gearbox", type: "major" },
  { name: "New Engine", category: "Engine & Gearbox", type: "major" },
  { name: "New gear box", category: "Engine & Gearbox", type: "major" },
  { name: "Engine coolant in motor oil", category: "Engine & Gearbox", type: "repair" },
  { name: "Tune engine, including adjustment tappets", category: "Engine & Gearbox", type: "service" },
  { name: "Adjust ignition timing", category: "Engine & Gearbox", type: "service" },

  // 6. Cab / Body components
  { name: "Missing or broken mirrors", category: "Cab & Body", type: "replacement" },
  { name: "Defective doors", category: "Cab & Body", type: "repair" },
  { name: "Operation of body hardware, doors, glasses, locks and keys", category: "Cab & Body", type: "inspection" },
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

    // Insert all expense types
    const result = await collection.insertMany(
      EXPENSE_TYPES.map((item, index) => ({
        name: item.name,
        category: item.category,
        type: item.type,
        description: `${item.category} - ${item.type}`,
        isDeleted: false,
        createdAt: new Date(),
        sortOrder: index,
      }))
    );

    console.log(`\n✅ Inserted ${result.insertedCount} expense types from your file:`);
    
    // Group by category for display
    const grouped = EXPENSE_TYPES.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item.name);
      return acc;
    }, {} as Record<string, string[]>);

    for (const [category, items] of Object.entries(grouped)) {
      console.log(`\n📁 ${category}: ${items.length} items`);
      items.forEach(item => console.log(`   ✓ ${item}`));
    }

    console.log(`\n🎉 Total expense types: ${result.insertedCount}`);
    
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seedExpenseTypes();