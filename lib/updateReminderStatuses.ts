import { Db } from "mongodb";

/**
 * Scans all reminders and updates their status based on due_date vs now.
 * Uses status values consistent with the rest of the app:
 *   - "completed"  → already completed, leave untouched
 *   - "overdue"    → due_date is in the past and not completed
 *   - "pending"    → due_date is in the future
 */
export async function updateReminderStatuses(db: Db): Promise<number> {
  const collection = db.collection("tblreminders");
  const now = new Date();

  const reminders = await collection.find({}).toArray();

  let updatedCount = 0;

  for (const reminder of reminders) {
    // Never overwrite a completed reminder
    if (reminder.status === "completed") continue;

    const dueDate = new Date(reminder.due_date);
    const newStatus = dueDate <= now ? "overdue" : "pending";

    if (reminder.status !== newStatus) {
      await collection.updateOne(
        { _id: reminder._id },
        { $set: { status: newStatus } }
      );
      updatedCount++;
    }
  }

  return updatedCount;
}