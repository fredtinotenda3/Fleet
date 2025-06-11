/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const COLLECTION = "tblvehicles";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const db = await connectToDatabase();

    if (!Array.from(searchParams.keys()).length) {
      const vehicles = await db
        .collection(COLLECTION)
        .find({ isDeleted: { $ne: true } })
        .toArray();
      return NextResponse.json(vehicles);
    }

    const filters = {
      license_plate: searchParams.get("license_plate"),
      make: searchParams.get("make"),
      model: searchParams.get("model"),
      status: searchParams.get("status"),
    };

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;
    const sortField = searchParams.get("sortBy") || "license_plate";
    const sortOrder = searchParams.get("sortOrder") === "desc" ? -1 : 1;

    const query: any = { isDeleted: { $ne: true } };
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query[key] = new RegExp(value, "i");
    });

    const [data, total] = await Promise.all([
      db
        .collection(COLLECTION)
        .find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection(COLLECTION).countDocuments(query),
    ]);

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch vehicles" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const vehicleData = await req.json();
    const requiredFields = [
      "license_plate",
      "make",
      "model",
      "year",
      "vehicle_type",
      "purchase_date",
      "fuel_type",
    ];

    if (!requiredFields.every((field) => vehicleData[field])) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const formattedPlate = vehicleData.license_plate.toUpperCase();

    if (
      await db.collection(COLLECTION).findOne({
        license_plate: formattedPlate,
        isDeleted: { $ne: true },
      })
    ) {
      return NextResponse.json(
        { error: "Vehicle already exists" },
        { status: 400 }
      );
    }

    const result = await db.collection(COLLECTION).insertOne({
      ...vehicleData,
      status: vehicleData.status || "active",
      license_plate: formattedPlate,
      isDeleted: false,
      createdAt: new Date(),
    });

    return NextResponse.json(
      { message: "Vehicle created", _id: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST error:", error);
    return NextResponse.json(
      { error: "Failed to create vehicle" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const { _id, ...updateData } = await req.json();

    if (!_id || !Object.keys(updateData).length) {
      return NextResponse.json(
        { error: "ID and update data required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const result = await db
      .collection(COLLECTION)
      .updateOne(
        { _id: new ObjectId(_id), isDeleted: { $ne: true } },
        { $set: updateData }
      );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Vehicle updated" });
  } catch (error) {
    console.error("PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update vehicle" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id)
      return NextResponse.json(
        { error: "Vehicle ID required" },
        { status: 400 }
      );

    const db = await connectToDatabase();
    const result = await db
      .collection(COLLECTION)
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { isDeleted: true, deletedAt: new Date() } }
      );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Vehicle deleted" });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete vehicle" },
      { status: 500 }
    );
  }
}
