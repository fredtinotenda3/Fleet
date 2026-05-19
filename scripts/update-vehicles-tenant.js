// C:\Users\user\Desktop\Fleet\scripts\update-vehicles-tenant.js

import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, "../.env") });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("❌ MONGODB_URI not defined in .env file");
  process.exit(1);
}

async function updateVehiclesTenant() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");
    
    const db = client.db("VehicleExpense");
    const collection = db.collection("tblvehicles");
    
    // Update all vehicles without tenantId to have 'default'
    const result = await collection.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: 'default' } }
    );
    console.log(`✅ Updated ${result.modifiedCount} vehicles with tenantId='default'`);
    
    // Count total vehicles
    const totalVehicles = await collection.countDocuments({ isDeleted: { $ne: true } });
    console.log(`📊 Total active vehicles in database: ${totalVehicles}`);
    
    // List all vehicles
    const vehicles = await collection.find({ isDeleted: { $ne: true } }).limit(10).toArray();
    console.log("\n📋 Sample vehicles:");
    vehicles.forEach(v => {
      console.log(`   - ${v.license_plate} | ${v.make} ${v.model} | tenantId: ${v.tenantId || 'MISSING'}`);
    });
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
    console.log("\n🔌 Disconnected");
  }
}

updateVehiclesTenant();