import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const COLLECTION = "tblexpense_types";

type ExpenseType = {
  _id?: ObjectId;
  name: string;
  isDeleted?: boolean;
};

// GET: Fetch all non-deleted expense types
export async function GET() {
  try {
    const db = await connectToDatabase();
    const data = await db
      .collection(COLLECTION)
      .find({ isDeleted: { $ne: true } })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch expense types",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// POST: Create a new expense type
export async function POST(req: Request) {
  try {
    const { name } = await req.json();

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Valid name is required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const trimmedName = name.trim();

    const exists = await db.collection(COLLECTION).findOne({
      name: { $regex: `^${trimmedName}$`, $options: "i" },
      isDeleted: { $ne: true },
    });

    if (exists) {
      return NextResponse.json(
        { error: "Expense type already exists" },
        { status: 409 }
      );
    }

    const doc: ExpenseType = { name: trimmedName };
    const result = await db.collection(COLLECTION).insertOne(doc);

    return NextResponse.json(
      { insertedId: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to create expense type",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// PUT: Update an existing expense type
export async function PUT(req: Request) {
  try {
    const { id, name } = await req.json();

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid or missing ID" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Valid name is required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const trimmedName = name.trim();

    const exists = await db.collection(COLLECTION).findOne({
      name: { $regex: `^${trimmedName}$`, $options: "i" },
      _id: { $ne: new ObjectId(id) },
      isDeleted: { $ne: true },
    });

    if (exists) {
      return NextResponse.json(
        { error: "Expense type already exists" },
        { status: 409 }
      );
    }

    const result = await db
      .collection(COLLECTION)
      .updateOne({ _id: new ObjectId(id) }, { $set: { name: trimmedName } });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Expense type not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Expense type updated successfully" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update expense type",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// DELETE: Soft delete an expense type
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid or missing ID" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    const isUsed = await db.collection("tblexpenses").findOne({
      expense_type_id: new ObjectId(id),
    });

    if (isUsed) {
      return NextResponse.json(
        { error: "Cannot delete: type is used in expenses" },
        { status: 400 }
      );
    }

    const result = await db
      .collection(COLLECTION)
      .updateOne({ _id: new ObjectId(id) }, { $set: { isDeleted: true } });

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { error: "Expense type not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Expense type deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to delete expense type",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
