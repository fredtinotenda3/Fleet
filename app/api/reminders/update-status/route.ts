import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { updateReminderStatuses } from "@/lib/updateReminderStatuses";

export async function GET() {
  try {
    const db = await connectToDatabase();
    const updatedCount = await updateReminderStatuses(db);

    return NextResponse.json({
      message: "Reminder statuses updated successfully.",
      updatedCount,
    });
  } catch (error) {
    console.error("Error updating reminder statuses:", error);
    return NextResponse.json(
      { error: "Failed to update reminder statuses" },
      { status: 500 }
    );
  }
}
