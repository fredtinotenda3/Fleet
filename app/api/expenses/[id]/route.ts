import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const COLLECTION = "tblexpenses";

// DELETE: Soft delete an expense
export async function DELETE(req: Request) {
  try {
    const pathSegments = new URL(req.url).pathname.split("/");
    const id = pathSegments[pathSegments.length - 1];

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid or missing ID" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    const existingExpense = await db.collection(COLLECTION).findOne({
      _id: new ObjectId(id),
      isDeleted: { $ne: true },
    });

    if (!existingExpense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const result = await db
      .collection(COLLECTION)
      .updateOne({ _id: new ObjectId(id) }, { $set: { isDeleted: true } });

    if (result.modifiedCount === 0) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Expense deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to delete expense",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
