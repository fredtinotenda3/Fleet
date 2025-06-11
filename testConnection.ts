import connectToDatabase from "@/lib/mongodb"; // Adjust if needed

async function testConnection() {
  try {
    const db = await connectToDatabase();
    const vehicles = await db.collection("tblvehicles").find().toArray(); // Adjust collection name if needed
    console.log("Successfully connected to MongoDB");
    console.log("Test Data:", vehicles);
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
  }
}

testConnection();
