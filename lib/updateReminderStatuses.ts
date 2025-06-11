import { Db } from "mongodb";

export async function updateReminderStatuses(db: Db): Promise<number> {
  const collection = db.collection("tblreminders");
  const now = new Date();

  const reminders = await collection.find({}).toArray();

  let updatedCount = 0;

  for (const reminder of reminders) {
    const dueDate = new Date(reminder.due_date);
    const newStatus = dueDate <= now ? "due" : "not due";

    if (!reminder.status || reminder.status !== newStatus) {
      await collection.updateOne(
        { _id: reminder._id },
        { $set: { status: newStatus } }
      );
      updatedCount++;
    }
  }

  return updatedCount;
}
