/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const COLLECTION = "tblfuellogs";

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
      {
        $lookup: {
          from: "tblunits",
          localField: "unit_id",
          foreignField: "unit_id",
          as: "unit",
        },
      },
      { $unwind: { path: "$unit", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          license_plate: 1,
          date: 1,
          fuel_volume: 1,
          cost: 1,
          odometer: 1,
          unit: { name: 1, symbol: 1, unit_id: 1 },
        },
      },
    ];

    // Add license plate filter if provided
    if (license_plate) {
      pipeline.unshift({
        $match: { license_plate: license_plate.toUpperCase() },
      });
    }

    const data = await db.collection(COLLECTION).aggregate(pipeline).toArray();
    return NextResponse.json(
      data.map((doc) => ({
        ...doc,
        _id: doc._id.toString(),
        unit_id: doc.unit?.unit_id,
      }))
    );
  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch fuel logs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const requiredFields = [
      "license_plate",
      "fuel_volume",
      "unit_id",
      "cost",
      "date",
      "odometer",
    ];
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

    const unit = await db.collection("tblunits").findOne({
      unit_id: body.unit_id,
    });

    if (!unit) {
      return NextResponse.json({ error: "Invalid unit ID" }, { status: 400 });
    }

    const insertData = {
      ...body,
      license_plate: body.license_plate.toUpperCase(),
      fuel_volume: Number(body.fuel_volume),
      cost: Number(body.cost),
      odometer: Number(body.odometer),
      date: new Date(body.date),
      unit_id: body.unit_id,
      createdAt: new Date(),
    };

    const result = await db.collection(COLLECTION).insertOne(insertData);
    return NextResponse.json(
      { _id: result.insertedId.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json(
      { error: "Failed to create fuel log" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid or missing ID" },
        { status: 400 }
      );
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

    if (body.unit_id) {
      const unit = await db.collection("tblunits").findOne({
        unit_id: body.unit_id,
      });
      if (!unit) {
        return NextResponse.json({ error: "Invalid unit ID" }, { status: 400 });
      }
    }

    const updateData: any = {
      ...(body.date && { date: new Date(body.date) }),
      ...(body.unit_id && { unit_id: body.unit_id }),
      ...(body.fuel_volume && { fuel_volume: Number(body.fuel_volume) }),
      ...(body.cost && { cost: Number(body.cost) }),
      ...(body.odometer && { odometer: Number(body.odometer) }),
      ...(body.license_plate && {
        license_plate: body.license_plate.toUpperCase(),
      }),
    };

    const result = await db
      .collection(COLLECTION)
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Fuel log not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json(
      { error: "Failed to update fuel log" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid or missing ID" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const result = await db.collection(COLLECTION).deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Fuel log not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE Error:", error);
    return NextResponse.json(
      { error: "Failed to delete fuel log" },
      { status: 500 }
    );
  }
}
