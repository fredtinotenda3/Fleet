/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { Reminder } from "@/lib/types/reminder";

const COLLECTION_NAME = "tblreminders";

export async function GET(req: NextRequest) {
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
      pipeline.unshift({
        $match: { license_plate: license_plate.toUpperCase() },
      });
    }

    const reminders = await collection.aggregate(pipeline).toArray();

    // Convert dates to ISO strings for proper serialization
    const formattedReminders = reminders.map((reminder) => ({
      ...reminder,
      due_date: reminder.due_date.toISOString(),
      ...(reminder.completion_date && {
        completion_date: reminder.completion_date.toISOString(),
      }),
    }));

    return NextResponse.json(formattedReminders);
  } catch (error) {
    console.error("Error fetching reminders:", error);
    return NextResponse.json(
      { error: "Failed to fetch reminders" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);
    const body = (await req.json()) as Reminder;

    if (!body.license_plate || !body.title || !body.due_date || !body.status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Convert to uppercase for consistency
    body.license_plate = body.license_plate.toUpperCase();

    // Check vehicle exists and isn't deleted
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

    // Convert due_date to proper Date object
    const dataToInsert = {
      ...body,
      due_date: new Date(body.due_date),
    };

    // Avoid inserting string _id
    const { _id, ...data } = dataToInsert;
    const result = await collection.insertOne(data);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error creating reminder:", error);
    return NextResponse.json(
      { error: "Failed to create reminder" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);
    const body = (await req.json()) as Reminder;

    if (!body._id || typeof body._id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid reminder ID" },
        { status: 400 }
      );
    }

    // Convert license_plate to uppercase if provided
    if (body.license_plate) {
      body.license_plate = body.license_plate.toUpperCase();

      // Check new vehicle exists and isn't deleted
      const vehicleExists = await db.collection("tblvehicles").findOne({
        license_plate: body.license_plate,
        isDeleted: { $ne: true },
      });

      if (!vehicleExists) {
        return NextResponse.json(
          { error: "New vehicle not found or deleted" },
          { status: 400 }
        );
      }
    }

    // Convert due_date to proper Date object
    const dataToUpdate = {
      ...body,
      due_date: new Date(body.due_date),
    };

    const { _id, ...updated } = dataToUpdate;

    const result = await collection.updateOne(
      { _id: new ObjectId(_id) },
      { $set: updated }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 }
      );
    }

    // Return the updated document
    const updatedDoc = await collection.findOne({ _id: new ObjectId(_id) });

    // Handle case where document might be null after update
    if (!updatedDoc) {
      return NextResponse.json(
        { error: "Reminder not found after update" },
        { status: 404 }
      );
    }

    // Format dates for response
    const formattedDoc = {
      ...updatedDoc,
      due_date: updatedDoc.due_date.toISOString(),
      ...(updatedDoc.completion_date && {
        completion_date: updatedDoc.completion_date.toISOString(),
      }),
    };

    return NextResponse.json(formattedDoc);
  } catch (error) {
    console.error("Error updating reminder:", error);
    return NextResponse.json(
      { error: "Failed to update reminder" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);
    const { id } = await req.json();

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid ID" },
        { status: 400 }
      );
    }

    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error deleting reminder:", error);
    return NextResponse.json(
      { error: "Failed to delete reminder" },
      { status: 500 }
    );
  }
}
