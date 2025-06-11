/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const COLLECTION = "tblexpenses";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const db = await connectToDatabase();
    const licensePlate = searchParams.get("license_plate");

    const aggregationPipeline: any[] = [
      {
        $match: {
          isDeleted: { $ne: true },
        },
      },
      {
        $lookup: {
          from: "tblvehicles",
          let: { expenseLicense: "$license_plate" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$license_plate", "$$expenseLicense"] },
                isDeleted: { $ne: true }, // CRITICAL: Only include non-deleted vehicles
              },
            },
          ],
          as: "vehicle_info",
        },
      },
      // Filter out expenses from deleted vehicles
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
      { $sort: { date: -1 } },
    ];

    // Add license plate filter if provided
    if (licensePlate) {
      aggregationPipeline[0].$match.license_plate = licensePlate.toUpperCase();
    }

    const data = await db
      .collection(COLLECTION)
      .aggregate(aggregationPipeline)
      .toArray();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch expenses", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const db = await connectToDatabase();
    const body = await req.json();
    const {
      license_plate,
      amount,
      date,
      description,
      jobTrip,
      notes,
      expense_type_id,
    } = body;

    if (
      !license_plate ||
      typeof license_plate !== "string" ||
      !amount ||
      isNaN(amount) ||
      !date ||
      !expense_type_id ||
      !ObjectId.isValid(expense_type_id)
    ) {
      return NextResponse.json(
        { error: "Missing or invalid fields" },
        { status: 400 }
      );
    }

    if (Number(amount) <= 0) {
      return NextResponse.json(
        { error: "Amount must be positive" },
        { status: 400 }
      );
    }

    if (new Date(date) > new Date()) {
      return NextResponse.json(
        { error: "Date cannot be in the future" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Invalid expense type ID" },
        { status: 400 }
      );
    }

    const doc = {
      license_plate: license_plate.toUpperCase(),
      amount: Number(amount),
      date: new Date(date),
      expense_type_id: new ObjectId(expense_type_id),
      ...(description && { description }),
      ...(jobTrip && { jobTrip }),
      ...(notes && { notes }),
      isDeleted: false,
    };

    const result = await db.collection(COLLECTION).insertOne(doc);

    return NextResponse.json(
      { insertedId: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create expense", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const db = await connectToDatabase();
    const body = await req.json();
    const {
      id,
      license_plate,
      amount,
      date,
      description,
      jobTrip,
      notes,
      expense_type_id,
    } = body;

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid or missing ID" },
        { status: 400 }
      );
    }

    const updateFields: any = {};

    if (license_plate) {
      const vehicleExists = await db.collection("tblvehicles").findOne({
        license_plate: license_plate.toUpperCase(),
        isDeleted: { $ne: true },
      });

      if (!vehicleExists) {
        return NextResponse.json(
          { error: "Vehicle not found" },
          { status: 400 }
        );
      }

      updateFields.license_plate = license_plate.toUpperCase();
    }

    if (amount !== undefined) {
      if (isNaN(amount) || Number(amount) <= 0) {
        return NextResponse.json(
          { error: "Amount must be positive" },
          { status: 400 }
        );
      }
      updateFields.amount = Number(amount);
    }

    if (date) {
      const newDate = new Date(date);
      if (newDate > new Date()) {
        return NextResponse.json(
          { error: "Date cannot be in the future" },
          { status: 400 }
        );
      }
      updateFields.date = newDate;
    }

    if (description !== undefined) updateFields.description = description;
    if (jobTrip !== undefined) updateFields.jobTrip = jobTrip;
    if (notes !== undefined) updateFields.notes = notes;

    if (expense_type_id) {
      if (!ObjectId.isValid(expense_type_id)) {
        return NextResponse.json(
          { error: "Invalid expense type ID" },
          { status: 400 }
        );
      }

      const typeExists = await db.collection("tblexpense_types").findOne({
        _id: new ObjectId(expense_type_id),
        isDeleted: { $ne: true },
      });

      if (!typeExists) {
        return NextResponse.json(
          { error: "Expense type not found" },
          { status: 400 }
        );
      }

      updateFields.expense_type_id = new ObjectId(expense_type_id);
    }

    const result = await db.collection(COLLECTION).updateOne(
      {
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      },
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
