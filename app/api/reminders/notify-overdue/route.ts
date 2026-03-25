/**
 * GET /api/reminders/notify-overdue
 *
 * Called by Vercel Cron daily at 8am.
 * Finds all reminders that just became overdue and logs them.
 * To enable real email: install Resend (npm install resend)
 * and add RESEND_API_KEY + NOTIFY_EMAIL to your .env
 */

import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";

// Vercel cron secret to prevent public access
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  // Verify this is called by Vercel cron, not a random visitor
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = await connectToDatabase();
    const now = new Date();

    // Find all pending reminders whose due_date has passed
    const overdueReminders = await db
      .collection("tblreminders")
      .find({
        status: "pending",
        due_date: { $lt: now },
      })
      .toArray();

    if (overdueReminders.length === 0) {
      return NextResponse.json({ message: "No newly overdue reminders.", count: 0 });
    }

    // Mark them as overdue in the database
    const ids = overdueReminders.map((r) => r._id);
    await db.collection("tblreminders").updateMany(
      { _id: { $in: ids } },
      { $set: { status: "overdue" } }
    );

    // ── Email notification (Resend) ──────────────────────────────
    // Uncomment this block after: npm install resend
    // and adding RESEND_API_KEY + NOTIFY_EMAIL to your .env
    //
    // const { Resend } = await import("resend");
    // const resend = new Resend(process.env.RESEND_API_KEY);
    //
    // const reminderList = overdueReminders
    //   .map((r) => `• ${r.license_plate} — ${r.title} (due ${new Date(r.due_date).toLocaleDateString()})`)
    //   .join("\n");
    //
    // await resend.emails.send({
    //   from: "Fleet Alerts <alerts@yourdomain.com>",
    //   to: process.env.NOTIFY_EMAIL!,
    //   subject: `Fleet Alert: ${overdueReminders.length} overdue maintenance reminder(s)`,
    //   text: `The following service reminders are now overdue:\n\n${reminderList}\n\nLog in to manage them: ${process.env.NEXTAUTH_URL}/maintenance`,
    // });
    // ─────────────────────────────────────────────────────────────

    console.log(`[notify-overdue] Marked ${overdueReminders.length} reminders as overdue.`);

    return NextResponse.json({
      message: `${overdueReminders.length} reminder(s) marked overdue.`,
      count: overdueReminders.length,
      reminders: overdueReminders.map((r) => ({
        license_plate: r.license_plate,
        title: r.title,
        due_date: r.due_date,
      })),
    });
  } catch (error) {
    console.error("[notify-overdue] Error:", error);
    return NextResponse.json({ error: "Failed to process overdue reminders" }, { status: 500 });
  }
}