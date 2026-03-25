/**
 * Updated reminders PUT handler.
 * When a reminder is marked "completed" and has a recurrence_interval,
 * it automatically creates the next reminder due N days/months later.
 *
 * recurrence_interval format: "30d" (30 days), "3m" (3 months), "1y" (1 year)
 *
 * Replace the existing PUT function in app/api/reminders/route.ts with this one.
 */

import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { requireAuth } from "@/lib/requireAuth";

const COLLECTION_NAME = "tblreminders";

function addInterval(date: Date, interval: string): Date {
  const next = new Date(date);
  const amount = parseInt(interval);
  const unit = interval.slice(-1); // "d", "m", or "y"

  if (unit === "d") next.setDate(next.getDate() + amount);
  else if (unit === "m") next.setMonth(next.getMonth() + amount);
  else if (unit === "y") next.setFullYear(next.getFullYear() + amount);

  return next;
}

export async function PUT(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const db = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);
    const body = await req.json();

    if (!body._id || typeof body._id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid reminder ID" },
        { status: 400 }
      );
    }

    if (body.license_plate) {
      body.license_plate = body.license_plate.toUpperCase();
      const vehicleExists = await db.collection("tblvehicles").findOne({
        license_plate: body.license_plate,
        isDeleted: { $ne: true },
      });
      if (!vehicleExists) {
        return NextResponse.json(
          { error: "Vehicle not found or deleted" },
          { status: 400 }
        );
      }
    }

    const dataToUpdate = {
      ...body,
      due_date: new Date(body.due_date),
      // Record completion date when marking as completed
      ...(body.status === "completed" && { completion_date: new Date() }),
    };

    const { _id, ...updated } = dataToUpdate;

    await collection.updateOne(
      { _id: new ObjectId(_id) },
      { $set: updated }
    );

    // ── #14 Recurring reminder ──────────────────────────────────
    // If just completed AND has a recurrence interval, create next one
    if (body.status === "completed" && body.recurrence_interval) {
      const nextDueDate = addInterval(new Date(body.due_date), body.recurrence_interval);

      const nextReminder = {
        license_plate: body.license_plate,
        title: body.title,
        notes: body.notes || "",
        status: "pending",
        due_date: nextDueDate,
        recurrence_interval: body.recurrence_interval,
        priority: body.priority,
        service_type: body.service_type,
      };

      await collection.insertOne(nextReminder);
    }
    // ─────────────────────────────────────────────────────────────

    const updatedDoc = await collection.findOne({ _id: new ObjectId(_id) });
    if (!updatedDoc) {
      return NextResponse.json(
        { error: "Reminder not found after update" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...updatedDoc,
      due_date: updatedDoc.due_date.toISOString(),
      ...(updatedDoc.completion_date && {
        completion_date: updatedDoc.completion_date.toISOString(),
      }),
    });
  } catch (error) {
    console.error("Error updating reminder:", error);
    return NextResponse.json(
      { error: "Failed to update reminder" },
      { status: 500 }
    );
  }
}