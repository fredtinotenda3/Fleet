import { MongoClient } from "mongodb";
import { updateReminderStatuses } from "../lib/updateReminderStatuses";

const uri = "mongodb://localhost:27017";
const dbName = "vehicle-expense-tracker";

async function run() {
  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db(dbName);
  const updatedCount = await updateReminderStatuses(db);

  console.log(`✅ ${updatedCount} reminder(s) updated.`);
  await client.close();
}

run().catch((err) => {
  console.error("❌ Failed to update reminders:", err);
});
