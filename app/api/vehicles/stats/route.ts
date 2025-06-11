/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/vehicles/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const licensePlate = searchParams.get("license_plate") || "";

    const db = await connectToDatabase();
    const collection = db.collection("tblvehicles");

    const query: any = {};
    if (licensePlate) {
      query.license_plate = new RegExp(licensePlate, "i");
    }

    const [total, active, inactive, maintenance] = await Promise.all([
      collection.countDocuments(query),
      collection.countDocuments({ ...query, status: "active" }),
      collection.countDocuments({ ...query, status: "inactive" }),
      collection.countDocuments({ ...query, status: "maintenance" }),
    ]);

    return NextResponse.json({
      total,
      active,
      inactive,
      maintenance,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch vehicle stats" },
      { status: 500 }
    );
  }
}
