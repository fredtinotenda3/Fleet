/**
 * One-off migration: convert any tblexpenses.expense_type_id values that
 * were stored as a plain string (by the pre-fix bulk-import and
 * update handlers) into real BSON ObjectIds, so they match
 * tblexpense_types._id and stop showing "Uncategorized".
 *
 * Safe to run multiple times: it only touches documents where
 * expense_type_id is currently a string.
 *
 * Run with: node scripts/fix-expense-type-id-types.js
 * (compile/ts-node if you keep it as .ts)
 */

import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function fixExpenseTypeIdTypes() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI environment variable is not defined");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("VehicleExpense");
    const expenses = db.collection("tblexpenses");
    const types = db.collection("tblexpense_types");

    // Find every expense whose expense_type_id is currently a string
    // (native driver returns these as JS strings, never as ObjectId).
    const cursor = expenses.find({
      expense_type_id: { $type: "string", $ne: "" },
    });

    let scanned = 0;
    let fixed = 0;
    let orphaned = 0;
    const orphanedIds: string[] = [];

    for await (const doc of cursor) {
      scanned++;
      const rawId = doc.expense_type_id as string;

      if (!ObjectId.isValid(rawId)) {
        orphaned++;
        orphanedIds.push(`${doc._id} -> invalid id "${rawId}"`);
        continue;
      }

      const objectId = new ObjectId(rawId);

      // Confirm the expense type still exists before repointing to it.
      const exists = await types.findOne({ _id: objectId });
      if (!exists) {
        orphaned++;
        orphanedIds.push(`${doc._id} -> missing type "${rawId}"`);
        continue;
      }

      await expenses.updateOne(
        { _id: doc._id },
        { $set: { expense_type_id: objectId, updatedAt: new Date() } }
      );
      fixed++;
    }

    console.log(`\nScanned: ${scanned}`);
    console.log(`Fixed (string -> ObjectId): ${fixed}`);
    console.log(`Orphaned (left untouched, needs manual review): ${orphaned}`);
    if (orphanedIds.length) {
      console.log("\nOrphaned expense_type_id values:");
      orphanedIds.forEach((line) => console.log(`  - ${line}`));
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("\nDisconnected from MongoDB");
  }
}

fixExpenseTypeIdTypes();