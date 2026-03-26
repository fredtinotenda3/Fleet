/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { requireAuth } from "@/lib/requireAuth";

const COLLECTION = "tblfuellogs";

export async function GET(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { searchParams } = new URL(req.url);
    const db = await connectToDatabase();

    const license_plate = searchParams.get("license_plate");
    const search = searchParams.get("search") || "";
    const unitId = searchParams.get("unit_id");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    const pageParam = searchParams.get("page");
    const paginated = !!pageParam;
    const page = parseInt(pageParam || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const matchStage: any = {};

    if (license_plate) matchStage.license_plate = license_plate.toUpperCase();
    if (search) matchStage.license_plate = { $regex: search, $options: "i" };
    if (unitId) matchStage.unit_id = unitId;
    if (start || end) {
      matchStage.date = {};
      if (start) matchStage.date.$gte = new Date(start);
      if (end) matchStage.date.$lte = new Date(end);
    }

    const basePipeline: any[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: "tblvehicles",
          let: { logLicense: "$license_plate" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$license_plate", "$$logLicense"] },
                isDeleted: { $ne: true },
              },
            },
          ],
          as: "vehicle_info",
        },
      },
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
          odometer: 1, // will be null/missing if not provided — that's fine
          unit_id: "$unit.unit_id",
          unit: { name: 1, symbol: 1, unit_id: 1 },
        },
      },
    ];

    if (paginated) {
      const [countResult, data] = await Promise.all([
        db.collection(COLLECTION).aggregate([...basePipeline, { $count: "total" }]).toArray(),
        db.collection(COLLECTION).aggregate([
          ...basePipeline,
          { $sort: { date: -1 } },
          { $skip: skip },
          { $limit: limit },
        ]).toArray(),
      ]);

      const total = countResult[0]?.total ?? 0;
      return NextResponse.json(
        data.map((doc) => ({ ...doc, _id: doc._id.toString() })),
        { headers: { "X-Total-Count": total.toString() } }
      );
    }

    const data = await db.collection(COLLECTION).aggregate([
      ...basePipeline,
      { $sort: { date: -1 } },
    ]).toArray();

    return NextResponse.json(data.map((doc) => ({ ...doc, _id: doc._id.toString() })));
  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json({ error: "Failed to fetch fuel logs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const body = await req.json();

    // FIX: odometer removed from required fields — it is now optional
    const requiredFields = ["license_plate", "fuel_volume", "unit_id", "cost", "date"];
    const missing = requiredFields.filter((field) => !body[field]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    const vehicle = await db.collection("tblvehicles").findOne({
      license_plate: body.license_plate.toUpperCase(),
      isDeleted: { $ne: true },
    });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found or deleted" }, { status: 400 });
    }

    const unit = await db.collection("tblunits").findOne({ unit_id: body.unit_id });
    if (!unit) {
      return NextResponse.json({ error: "Invalid unit ID" }, { status: 400 });
    }

    const insertData: any = {
      license_plate: body.license_plate.toUpperCase(),
      fuel_volume: Number(body.fuel_volume),
      cost: Number(body.cost),
      date: new Date(body.date),
      unit_id: body.unit_id,
      createdAt: new Date(),
    };

    // Only store odometer if provided
    if (body.odometer !== undefined && body.odometer !== null && body.odometer !== "") {
      insertData.odometer = Number(body.odometer);
    }

    const result = await db.collection(COLLECTION).insertOne(insertData);
    return NextResponse.json({ _id: result.insertedId.toString() }, { status: 201 });
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json({ error: "Failed to create fuel log" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid or missing ID" }, { status: 400 });
    }

    const body = await req.json();
    const db = await connectToDatabase();

    if (body.license_plate) {
      const vehicle = await db.collection("tblvehicles").findOne({
        license_plate: body.license_plate.toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicle) {
        return NextResponse.json({ error: "Vehicle not found or deleted" }, { status: 400 });
      }
    }

    if (body.unit_id) {
      const unit = await db.collection("tblunits").findOne({ unit_id: body.unit_id });
      if (!unit) {
        return NextResponse.json({ error: "Invalid unit ID" }, { status: 400 });
      }
    }

    const updateData: any = {
      ...(body.date && { date: new Date(body.date) }),
      ...(body.unit_id && { unit_id: body.unit_id }),
      ...(body.fuel_volume && { fuel_volume: Number(body.fuel_volume) }),
      ...(body.cost && { cost: Number(body.cost) }),
      ...(body.license_plate && { license_plate: body.license_plate.toUpperCase() }),
    };

    // Odometer optional on edit too
    if (body.odometer !== undefined && body.odometer !== null && body.odometer !== "") {
      updateData.odometer = Number(body.odometer);
    }

    const result = await db
      .collection(COLLECTION)
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Fuel log not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json({ error: "Failed to update fuel log" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid or missing ID" }, { status: 400 });
    }

    const db = await connectToDatabase();
    const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Fuel log not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE Error:", error);
    return NextResponse.json({ error: "Failed to delete fuel log" }, { status: 500 });
  }
}