// C:\Users\user\Desktop\Fleet\scripts\make-me-admin.js

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config({ path: ".env" });

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI not defined");

async function makeMeAdmin() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db("VehicleExpense");
    const collection = db.collection("tbladmin");

    const yourEmail = "fredtinotenda3@gmail.com"; // CHANGE THIS
    const yourFirstName = "Stanley"; // CHANGE THIS
    const yourPassword = "1011"; // CHANGE THIS

    const hashedPassword = await bcrypt.hash(yourPassword, 10);

    const result = await collection.updateOne(
      { Email: yourEmail },
      {
        $set: {
          FirstName: yourFirstName,
          Password: hashedPassword,
          Role: "super_admin",
          roles: ["super_admin", "organization_owner"],
          permissions: ["*"],
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    if (result.upsertedId) {
      console.log(`✅ Created new admin: ${yourEmail} with super_admin role`);
    } else if (result.modifiedCount > 0) {
      console.log(`✅ Updated ${yourEmail} to super_admin role`);
    } else {
      console.log(`ℹ️ User ${yourEmail} already has correct role`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
  }
}

makeMeAdmin();