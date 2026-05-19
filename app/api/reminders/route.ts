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

// Helper to validate category
const VALID_CATEGORIES = [
  "braking_system",
  "fuel_system", 
  "spring_suspension",
  "auto_electricals",
  "engine_gearbox",
  "cab_body"
];

const VALID_PRIORITIES = ["critical", "high", "medium", "low"];
const VALID_STATUSES = ["pending", "completed", "overdue"];

export async function GET(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const db = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);
    const license_plate = req.nextUrl.searchParams.get("license_plate");
    const category = req.nextUrl.searchParams.get("category");
    const priority = req.nextUrl.searchParams.get("priority");
    const status = req.nextUrl.searchParams.get("status");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const skip = (page - 1) * limit;

    // Build query
    const query: any = {};

    if (license_plate) {
      query.license_plate = license_plate.toUpperCase();
    }

    if (category && category !== "all") {
      query.category = category;
    }

    if (priority && priority !== "all") {
      query.priority = priority;
    }

    if (status && status !== "all") {
      query.status = status;
    }

    const pipeline: any[] = [
      { $match: query },
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
      { $sort: { due_date: 1 } },
    ];

    // Check if pagination is requested
    const paginated = req.nextUrl.searchParams.has("page");

    if (paginated) {
      const [countResult, reminders] = await Promise.all([
        collection.aggregate([...pipeline, { $count: "total" }]).toArray(),
        collection.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]).toArray(),
      ]);

      const total = countResult[0]?.total ?? 0;

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

      return NextResponse.json(formattedReminders, {
        headers: { "X-Total-Count": total.toString() },
      });
    }

    // Non-paginated response
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
    const body = await req.json();

    // Validate required fields
    if (!body.license_plate || !body.title || !body.due_date || !body.status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate status
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    // Validate category if provided
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: "Invalid category value" }, { status: 400 });
    }

    // Validate priority if provided
    if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: "Invalid priority value" }, { status: 400 });
    }

    body.license_plate = body.license_plate.toUpperCase();

    const vehicleExists = await db.collection("tblvehicles").findOne({
      license_plate: body.license_plate,
      isDeleted: { $ne: true },
    });

    if (!vehicleExists) {
      return NextResponse.json({ error: "Vehicle not found or deleted" }, { status: 400 });
    }

    // Prepare data for insertion
    const dataToInsert: any = {
      license_plate: body.license_plate,
      title: body.title,
      due_date: new Date(body.due_date),
      status: body.status,
      notes: body.notes || "",
      created_at: new Date(),
    };

    // Add optional fields if provided
    if (body.category) dataToInsert.category = body.category;
    if (body.priority) dataToInsert.priority = body.priority;
    if (body.recurrence_interval) dataToInsert.recurrence_interval = body.recurrence_interval;
    if (body.estimated_cost) dataToInsert.estimated_cost = Number(body.estimated_cost);
    if (body.service_type) dataToInsert.service_type = body.service_type;

    // If status is completed, set completion date
    if (body.status === "completed") {
      dataToInsert.completion_date = new Date();
    }

    const result = await collection.insertOne(dataToInsert);

    return NextResponse.json({ 
      _id: result.insertedId,
      message: "Reminder created successfully" 
    }, { status: 201 });
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

    // Validate status if provided
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    // Validate category if provided
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: "Invalid category value" }, { status: 400 });
    }

    // Validate priority if provided
    if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: "Invalid priority value" }, { status: 400 });
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

    // Prepare update data
    const dataToUpdate: any = {};

    if (body.title) dataToUpdate.title = body.title;
    if (body.due_date) dataToUpdate.due_date = new Date(body.due_date);
    if (body.status) dataToUpdate.status = body.status;
    if (body.notes !== undefined) dataToUpdate.notes = body.notes;
    if (body.category) dataToUpdate.category = body.category;
    if (body.priority) dataToUpdate.priority = body.priority;
    if (body.recurrence_interval !== undefined) dataToUpdate.recurrence_interval = body.recurrence_interval;
    if (body.estimated_cost !== undefined) dataToUpdate.estimated_cost = Number(body.estimated_cost);
    if (body.license_plate) dataToUpdate.license_plate = body.license_plate;

    // Record completion date when marking as completed
    if (body.status === "completed" && !body.completion_date) {
      dataToUpdate.completion_date = new Date();
    }

    // If status is not completed, remove completion_date
    if (body.status && body.status !== "completed") {
      dataToUpdate.completion_date = null;
    }

    const { _id, ...updated } = dataToUpdate;

    await collection.updateOne(
      { _id: new ObjectId(_id) },
      { $set: updated }
    );

    // ── #14 Recurring reminder ─────────────────────────────────────────────
    // If just completed AND has a recurrence interval, create next one
    if (body.status === "completed" && body.recurrence_interval && body.recurrence_interval !== "none") {
      // Get the current reminder to access its data
      const currentReminder = await collection.findOne({ _id: new ObjectId(_id) });
      
      if (currentReminder) {
        const nextDueDate = addInterval(
          new Date(body.due_date || currentReminder.due_date), 
          body.recurrence_interval
        );

        const nextReminder: any = {
          license_plate: body.license_plate || currentReminder.license_plate,
          title: body.title || currentReminder.title,
          notes: body.notes !== undefined ? body.notes : (currentReminder.notes || ""),
          status: "pending",
          due_date: nextDueDate,
          recurrence_interval: body.recurrence_interval,
          created_at: new Date(),
        };

        // Copy category and priority to next reminder
        if (body.category || currentReminder.category) {
          nextReminder.category = body.category || currentReminder.category;
        }
        if (body.priority || currentReminder.priority) {
          nextReminder.priority = body.priority || currentReminder.priority;
        }
        if (body.service_type || currentReminder.service_type) {
          nextReminder.service_type = body.service_type || currentReminder.service_type;
        }

        await collection.insertOne(nextReminder);
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    const updatedDoc = await collection.findOne({ _id: new ObjectId(_id) });
    if (!updatedDoc) {
      return NextResponse.json(
        { error: "Reminder not found after update" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...updatedDoc,
      due_date: updatedDoc.due_date instanceof Date 
        ? updatedDoc.due_date.toISOString() 
        : updatedDoc.due_date,
      ...(updatedDoc.completion_date && {
        completion_date: updatedDoc.completion_date instanceof Date 
          ? updatedDoc.completion_date.toISOString() 
          : updatedDoc.completion_date,
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

    return NextResponse.json({ message: "Reminder deleted successfully" });
  } catch (error) {
    console.error("Error deleting reminder:", error);
    return NextResponse.json({ error: "Failed to delete reminder" }, { status: 500 });
  }
}