/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { requireAuth } from "@/lib/requireAuth";

const COLLECTION = "tblexpenses";

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { searchParams } = new URL(req.url);
    const db = await connectToDatabase();

    const licensePlate = searchParams.get("license_plate");
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    // Pagination — only applied when page param is present
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const paginated = !!pageParam;
    const page = parseInt(pageParam || "1");
    const limit = parseInt(limitParam || "50");
    const skip = (page - 1) * limit;

    // Base match stage
    const matchStage: any = { isDeleted: { $ne: true } };

    if (licensePlate) {
      matchStage.license_plate = licensePlate.toUpperCase();
    }

    if (search) {
      matchStage.$or = [
        { license_plate: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (start || end) {
      matchStage.date = {};
      if (start) matchStage.date.$gte = new Date(start);
      if (end) matchStage.date.$lte = new Date(end);
    }

    // Build aggregation pipeline
    const basePipeline: any[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: "tblvehicles",
          let: { expenseLicense: "$license_plate" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$license_plate", "$$expenseLicense"] },
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
          from: "tblexpense_types",
          localField: "expense_type_id",
          foreignField: "_id",
          as: "expense_type",
        },
      },
      { $unwind: { path: "$expense_type", preserveNullAndEmptyArrays: true } },
    ];

    // Filter by expense type name if provided
    if (type && type !== "all") {
      basePipeline.push({
        $match: { "expense_type.name": { $regex: `^${type}$`, $options: "i" } },
      });
    }

    if (paginated) {
      // Run count and data in parallel
      const [countResult, data] = await Promise.all([
        db.collection(COLLECTION).aggregate([
          ...basePipeline,
          { $count: "total" },
        ]).toArray(),
        db.collection(COLLECTION).aggregate([
          ...basePipeline,
          { $sort: { date: -1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: { vehicle_info: 0 } },
        ]).toArray(),
      ]);

      const total = countResult[0]?.total ?? 0;

      return NextResponse.json(data, {
        headers: { "X-Total-Count": total.toString() },
      });
    }

    // No pagination — return all (used by charts/dashboard)
    const data = await db.collection(COLLECTION).aggregate([
      ...basePipeline,
      { $sort: { date: -1 } },
      { $project: { vehicle_info: 0 } },
    ]).toArray();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch expenses", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const db = await connectToDatabase();
    const body = await req.json();
    const { license_plate, amount, date, description, jobTrip, notes, expense_type_id } = body;

    if (
      !license_plate || typeof license_plate !== "string" ||
      !amount || isNaN(amount) ||
      !date || !expense_type_id || !ObjectId.isValid(expense_type_id)
    ) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    if (Number(amount) <= 0) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }

    if (new Date(date) > new Date()) {
      return NextResponse.json({ error: "Date cannot be in the future" }, { status: 400 });
    }

    const vehicleExists = await db.collection("tblvehicles").findOne({
      license_plate: license_plate.toUpperCase(),
      isDeleted: { $ne: true },
    });
    if (!vehicleExists) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 400 });
    }

    const typeExists = await db.collection("tblexpense_types").findOne({
      _id: new ObjectId(expense_type_id),
      isDeleted: { $ne: true },
    });
    if (!typeExists) {
      return NextResponse.json({ error: "Invalid expense type ID" }, { status: 400 });
    }

    const result = await db.collection(COLLECTION).insertOne({
      license_plate: license_plate.toUpperCase(),
      amount: Number(amount),
      date: new Date(date),
      expense_type_id: new ObjectId(expense_type_id),
      ...(description && { description }),
      ...(jobTrip && { jobTrip }),
      ...(notes && { notes }),
      isDeleted: false,
    });

    return NextResponse.json({ insertedId: result.insertedId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create expense", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const db = await connectToDatabase();
    const body = await req.json();
    const { id, license_plate, amount, date, description, jobTrip, notes, expense_type_id } = body;

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid or missing ID" }, { status: 400 });
    }

    const updateFields: any = {};

    if (license_plate) {
      const vehicleExists = await db.collection("tblvehicles").findOne({
        license_plate: license_plate.toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicleExists) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 400 });
      }
      updateFields.license_plate = license_plate.toUpperCase();
    }

    if (amount !== undefined) {
      if (isNaN(amount) || Number(amount) <= 0) {
        return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
      }
      updateFields.amount = Number(amount);
    }

    if (date) {
      const newDate = new Date(date);
      if (newDate > new Date()) {
        return NextResponse.json({ error: "Date cannot be in the future" }, { status: 400 });
      }
      updateFields.date = newDate;
    }

    if (description !== undefined) updateFields.description = description;
    if (jobTrip !== undefined) updateFields.jobTrip = jobTrip;
    if (notes !== undefined) updateFields.notes = notes;

    if (expense_type_id) {
      if (!ObjectId.isValid(expense_type_id)) {
        return NextResponse.json({ error: "Invalid expense type ID" }, { status: 400 });
      }
      const typeExists = await db.collection("tblexpense_types").findOne({
        _id: new ObjectId(expense_type_id),
        isDeleted: { $ne: true },
      });
      if (!typeExists) {
        return NextResponse.json({ error: "Expense type not found" }, { status: 400 });
      }
      updateFields.expense_type_id = new ObjectId(expense_type_id);
    }

    const result = await db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id), isDeleted: { $ne: true } },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Expense updated successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update expense", details: (error as Error).message },
      { status: 500 }
    );
  }
}