import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { Unit } from "@/types";

const COLLECTION = "tblunits";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const db = await connectToDatabase();

    const query = type ? { type: type.toLowerCase() } : {};
    const units = await db
      .collection<Unit>(COLLECTION)
      .find(query)
      .project({ unit_id: 1, name: 1, symbol: 1, type: 1 })
      .toArray();

    return NextResponse.json(units);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch units" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { unit_id, name, symbol, type } = await req.json();

    if (!unit_id || !name || !symbol || !type) {
      return NextResponse.json(
        { error: "All fields (unit_id, name, symbol, type) are required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const existing = await db.collection(COLLECTION).findOne({ unit_id });
    if (existing) {
      return NextResponse.json(
        { error: "Unit ID already exists" },
        { status: 400 }
      );
    }

    const result = await db.collection(COLLECTION).insertOne({
      unit_id,
      name,
      symbol,
      type,
      createdAt: new Date(),
    });

    return NextResponse.json(
      { _id: result.insertedId, unit_id, name, symbol, type },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create unit" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const { _id, ...updateData } = await req.json();

    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json(
        { error: "Valid unit ID required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const result = await db
      .collection(COLLECTION)
      .updateOne({ _id: new ObjectId(_id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to update unit" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { _id } = await req.json();

    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json(
        { error: "Valid unit ID required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const result = await db.collection(COLLECTION).deleteOne({
      _id: new ObjectId(_id),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to delete unit" },
      { status: 500 }
    );
  }
}
