import connectToDatabase from "@/lib/mongodb";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// 📤 PUT /api/admin/update
export const PUT = async (req) => {
  const body = await req.json();
  const { id, ...updateData } = body;

  if (!id) {
    return NextResponse.json({ message: "Missing admin ID" }, { status: 400 });
  }

  try {
    const db = await connectToDatabase();
    const result = await db
      .collection("tbladmin")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json({ message: "Admin not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Admin updated successfully 🛠️" });
  } catch (err) {
    console.error("❌ Update error:", err);
    return NextResponse.json(
      { message: "Server error during update" },
      { status: 500 }
    );
  }
};
