import connectToDatabase from "@/lib/mongodb";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAuth } from "@/lib/requireAuth";

// FIX (🔴 Critical): this route had NO auth check. Any unauthenticated
// caller could permanently hard-delete any row in tbladmin by ID —
// including, trivially, every admin account in the system if IDs were
// enumerated. requireAuth() closes the anonymous-access hole, matching
// the sibling admin/route.ts, admin/register, and admin/update fixes.
export const DELETE = async (req) => {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ message: "Missing admin ID" }, { status: 400 });
  }

  try {
    const db = await connectToDatabase();
    const result = await db
      .collection("tbladmin")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ message: "Admin not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Admin deleted successfully 🗑️" });
  } catch (err) {
    console.error("❌ Delete error:", err);
    return NextResponse.json(
      { message: "Server error during deletion" },
      { status: 500 }
    );
  }
};