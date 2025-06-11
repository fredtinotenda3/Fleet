/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { MeterLog } from "@/types";

const COLLECTION = "tblmeterlogs";

export async function GET(req: NextRequest) {
  try {
    const license_plate = req.nextUrl.searchParams.get("license_plate");
    const db = await connectToDatabase();

    const pipeline: any[] = [
      {
        $lookup: {
          from: "tblvehicles",
          let: { logLicense: "$license_plate" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$license_plate", "$$logLicense"] },
                isDeleted: { $ne: true }, // Filter out deleted vehicles
              },
            },
          ],
          as: "vehicle_info",
        },
      },
      // Filter out logs from deleted vehicles
      { $match: { "vehicle_info.0": { $exists: true } } },
      { $sort: { date: -1 } },
    ];

    // Add license plate filter if provided
    if (license_plate) {
      pipeline.unshift({
        $match: { license_plate: license_plate.toUpperCase() },
      });
    }

    const data = await db.collection(COLLECTION).aggregate(pipeline).toArray();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch meter logs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const requiredFields = ["license_plate", "date", "odometer", "unit_id"];
    const missing = requiredFields.filter((field) => !body[field]);

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    // Check vehicle exists and isn't deleted
    const vehicle = await db.collection("tblvehicles").findOne({
      license_plate: body.license_plate.toUpperCase(),
      isDeleted: { $ne: true },
    });

    if (!vehicle) {
      return NextResponse.json(
        { error: "Vehicle not found or deleted" },
        { status: 400 }
      );
    }

    // Validate unit exists
    const unit = await db.collection("tblunits").findOne({
      unit_id: body.unit_id,
      type: "distance",
    });

    if (!unit) {
      return NextResponse.json(
        { error: "Invalid distance unit" },
        { status: 400 }
      );
    }

    const insertData = {
      ...body,
      odometer: Number(body.odometer),
      date: new Date(body.date),
      createdAt: new Date(),
    };

    const result = await db.collection(COLLECTION).insertOne(insertData);
    return NextResponse.json(
      {
        _id: result.insertedId.toString(),
        ...insertData,
        date: insertData.date.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json(
      { error: "Failed to create meter log" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid log ID" }, { status: 400 });
    }

    const body = await req.json();
    const db = await connectToDatabase();

    if (body.license_plate) {
      // Check new vehicle exists and isn't deleted
      const vehicle = await db.collection("tblvehicles").findOne({
        license_plate: body.license_plate.toUpperCase(),
        isDeleted: { $ne: true },
      });

      if (!vehicle) {
        return NextResponse.json(
          { error: "Vehicle not found or deleted" },
          { status: 400 }
        );
      }
    }

    const updateData: Partial<MeterLog> = {
      ...(body.date && { date: new Date(body.date) }),
      ...(body.odometer && { odometer: Number(body.odometer) }),
      ...(body.unit_id && { unit_id: body.unit_id }),
    };

    const result = await db
      .collection(COLLECTION)
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Meter log not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json(
      { error: "Failed to update meter log" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid log ID" }, { status: 400 });
    }

    const db = await connectToDatabase();
    const result = await db.collection(COLLECTION).deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Meter log not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE Error:", error);
    return NextResponse.json(
      { error: "Failed to delete meter log" },
      { status: 500 }
    );
  }
}
