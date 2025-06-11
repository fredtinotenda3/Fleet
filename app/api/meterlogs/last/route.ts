/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const COLLECTION = "tblmeterlogs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const license_plate = searchParams.get("license_plate");

    if (!license_plate) {
      return NextResponse.json(
        { error: "license_plate is required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    const lastLog = await db
      .collection(COLLECTION)
      .find({ license_plate: license_plate.toUpperCase() })
      .sort({ date: -1 })
      .limit(1)
      .toArray();

    if (!lastLog.length) {
      return NextResponse.json({
        message: "No previous logs found",
        odometer: 0,
      });
    }

    const { odometer } = lastLog[0];

    return NextResponse.json({ odometer });
  } catch (error) {
    console.error("Error fetching last odometer:", error);
    return NextResponse.json(
      { error: "Failed to fetch last odometer" },
      { status: 500 }
    );
  }
}
