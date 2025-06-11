// app/api/admin/route.js
import connectToDatabase from "@/lib/mongodb";
import { NextResponse } from "next/server";

export const GET = async () => {
  try {
    const db = await connectToDatabase();
    const admins = await db.collection("tbladmin").find().toArray();

    return NextResponse.json(admins, { status: 200 });
  } catch (err) {
    console.error("❌ Error fetching admins:", err);
    return NextResponse.json(
      { message: "Server error fetching admins" },
      { status: 500 }
    );
  }
};
