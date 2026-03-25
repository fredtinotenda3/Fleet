/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { Reminder } from "@/lib/types/reminder";
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

export async function GET(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const db = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);
    const license_plate = req.nextUrl.searchParams.get("license_plate");

    const pipeline: any[] = [
      {
        $lookup: {
          from: "tblvehicles",
          let: { reminderLicense: "$license_plate" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$license_plate", "$$reminderLicense"] },
                isDeleted: { $ne: true },
              },
            },
          ],
          as: "vehicle_info",
        },
      },
      { $match: { "vehicle_info.0": { $exists: true } } },
      { $project: { vehicle_info: 0 } },
    ];

    if (license_plate) {
      pipeline.unshift({ $match: { license_plate: license_plate.toUpperCase() } });
    }

    const reminders = await collection.aggregate(pipeline).toArray();

    const formattedReminders = reminders.map((reminder) => ({
      ...reminder,
      due_date: reminder.due_date instanceof Date 
        ? reminder.due_date.toISOString() 
        : reminder.due_date,
      ...(reminder.completion_date && {
        completion_date: reminder.completion_date instanceof Date 
          ? reminder.completion_date.toISOString() 
          : reminder.completion_date,
      }),
    }));

    return NextResponse.json(formattedReminders);
  } catch (error) {
    console.error("Error fetching reminders:", error);
    return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const db = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);
    const body = (await req.json()) as Reminder;

    if (!body.license_plate || !body.title || !body.due_date || !body.status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    body.license_plate = body.license_plate.toUpperCase();

    const vehicleExists = await db.collection("tblvehicles").findOne({
      license_plate: body.license_plate,
      isDeleted: { $ne: true },
    });

    if (!vehicleExists) {
      return NextResponse.json({ error: "Vehicle not found or deleted" }, { status: 400 });
    }

    const dataToInsert = { ...body, due_date: new Date(body.due_date) };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...data } = dataToInsert;
    const result = await collection.insertOne(data);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error creating reminder:", error);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  }
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

export async function DELETE(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const db = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);
    const { id } = await req.json();

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing or invalid ID" }, { status: 400 });
    }

    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error deleting reminder:", error);
    return NextResponse.json({ error: "Failed to delete reminder" }, { status: 500 });
  }
}