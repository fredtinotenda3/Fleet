import connectToDatabase from "@/lib/mongodb";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAuth } from "@/lib/requireAuth";

// FIX (🔴 Critical): this route had NO auth check. Any unauthenticated
// caller could PUT arbitrary fields — including Password — onto any
// tbladmin row by ID, which is a full account-takeover primitive (set
// someone else's password hash, or your own email, without logging in
// first). requireAuth() closes the anonymous-access hole, matching the
// pattern applied to the sibling admin/route.ts, admin/register, and
// admin/delete routes.
//
// NOTE: this still allows an authenticated (non-admin) caller to edit
// ANY admin's row by guessing an ID, since there's no ownership or
// role check on top of requireAuth(). That's a smaller, second issue
// worth a follow-up pass once this module's role model for tbladmin
// is confirmed (it appears to predate modules/security's Role enum).
export const PUT = async (req) => {
  const unauth = await requireAuth();
  if (unauth) return unauth;

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