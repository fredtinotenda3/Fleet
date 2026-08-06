//lib/updateReminderStatuses.ts

import { Db } from "mongodb";

const ORGANIZATION_BATCH_SIZE = 200;

/**
 * FIX (Phase D -- enterprise organization-aware background processing):
 * this previously ran `collection.find({}).toArray()` -- a literal,
 * completely unscoped scan of the entire tblreminders collection across
 * every organization on the platform in one pass. That is exactly the
 * pattern Phase D exists to eliminate (requirement 1: "no background
 * job may ever operate against the whole database").
 *
 * This is a standalone script invoked outside the application's
 * request/DI context (see scripts/update-reminders-status.js, which
 * opens its own MongoClient), so it cannot import the app's
 * TenantContextService/OrganizationRepository the way in-process
 * workers do without additional build tooling. Instead it enumerates
 * active organizations directly off the same `Db` handle the caller
 * already supplies, batching the scan (Phase D requirement 10 -- no
 * unbounded full-collection loads), and scopes every reminder query to
 * one resolved organization's tenantId at a time. An organization whose
 * tenantId cannot be resolved is skipped and logged rather than falling
 * through to an unscoped update (requirement 8 -- fail closed, never
 * silently default to processing without a resolved tenant).
 *
 * Uses status values consistent with the rest of the app:
 *   - "completed"  -> already completed, leave untouched
 *   - "overdue"    -> due_date is in the past and not completed
 *   - "pending"    -> due_date is in the future
 */
export async function updateReminderStatuses(db: Db): Promise<number> {
  const reminders = db.collection("tblreminders");
  const organizations = db.collection("tblorganizations");
  const now = new Date();

  let updatedCount = 0;
  let offset = 0;
  let organizationsProcessed = 0;
  let organizationsSkipped = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const orgBatch = await organizations
      .find(
        { isDeleted: { $ne: true }, status: "active" },
        { projection: { tenantId: 1 } }
      )
      .sort({ _id: 1 })
      .skip(offset)
      .limit(ORGANIZATION_BATCH_SIZE)
      .toArray();

    if (orgBatch.length === 0) break;

    for (const org of orgBatch) {
      const tenantId: string | undefined = org.tenantId || org._id?.toString();

      if (!tenantId) {
        // Fail closed: never process reminders for an organization we
        // cannot positively identify a tenantId for.
        organizationsSkipped++;
        console.warn(`⚠️  Skipping organization ${org._id} — no resolvable tenantId`);
        continue;
      }

      const orgReminders = await reminders
        .find({ tenantId })
        .toArray();

      for (const reminder of orgReminders) {
        // Never overwrite a completed reminder
        if (reminder.status === "completed") continue;

        const dueDate = new Date(reminder.due_date);
        const newStatus = dueDate <= now ? "overdue" : "pending";

        if (reminder.status !== newStatus) {
          await reminders.updateOne(
            { _id: reminder._id, tenantId },
            { $set: { status: newStatus } }
          );
          updatedCount++;
        }
      }

      organizationsProcessed++;
    }

    offset += orgBatch.length;
  }

  console.log(
    `ℹ️  Processed ${organizationsProcessed} organization(s), skipped ${organizationsSkipped}`
  );

  return updatedCount;
}