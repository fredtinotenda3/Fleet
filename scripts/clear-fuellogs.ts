import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function clearFuelLogs() {
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
    
    const result = await db.collection("tblfuellogs").deleteMany({});
    console.log(`🗑️ Deleted ${result.deletedCount} fuel logs`);
    
    console.log("✅ All fuel log data cleared!");
  } catch (error) {
    console.error("❌ Clear failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

clearFuelLogs();