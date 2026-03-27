/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { requireAuth } from "@/lib/requireAuth";
import { Trip } from "@/types";

const COLLECTION = "tbltrips";

// Helper to calculate distance from trip data
function calculateDistance(data: {
  mode: string;
  trip_distance?: number;
  start_odometer?: number;
  end_odometer?: number;
}): number {
  if (data.mode === "distance") {
    return data.trip_distance || 0;
  } else if (data.mode === "odometer") {
    const start = data.start_odometer || 0;
    const end = data.end_odometer || 0;
    return end - start;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { searchParams } = new URL(req.url);
    const license_plate = searchParams.get("license_plate");
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const db = await connectToDatabase();

    const matchStage: any = {};

    if (license_plate) {
      matchStage.license_plate = license_plate.toUpperCase();
    }

    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    // Check if pagination is requested
    const paginated = searchParams.has("page");

    if (paginated) {
      const [data, total] = await Promise.all([
        db
          .collection(COLLECTION)
          .find(matchStage)
          .sort({ date: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        db.collection(COLLECTION).countDocuments(matchStage),
      ]);

      return NextResponse.json({
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    // Non-paginated response for charts/summaries
    const data = await db
      .collection(COLLECTION)
      .find(matchStage)
      .sort({ date: -1 })
      .toArray();

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/trips error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trips" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const body = await req.json();
    const { license_plate, mode, date, notes, unit_id } = body;

    // Validate required fields
    if (!license_plate || !mode || !date || !unit_id) {
      return NextResponse.json(
        { error: "Missing required fields: license_plate, mode, date, unit_id" },
        { status: 400 }
      );
    }

    // Validate mode-specific fields
    if (mode === "distance" && !body.trip_distance) {
      return NextResponse.json(
        { error: "Trip distance is required for distance mode" },
        { status: 400 }
      );
    }

    if (mode === "odometer" && (body.start_odometer === undefined || body.end_odometer === undefined)) {
      return NextResponse.json(
        { error: "Start and end odometer readings are required for odometer mode" },
        { status: 400 }
      );
    }

    // Validate odometer readings are non-negative
    if (mode === "odometer") {
      if (body.start_odometer < 0 || body.end_odometer < 0) {
        return NextResponse.json(
          { error: "Odometer readings must be non-negative" },
          { status: 400 }
        );
      }
      if (body.end_odometer < body.start_odometer) {
        return NextResponse.json(
          { error: "End odometer cannot be less than start odometer" },
          { status: 400 }
        );
      }
    }

    // Validate distance is positive
    if (mode === "distance" && body.trip_distance <= 0) {
      return NextResponse.json(
        { error: "Trip distance must be greater than 0" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    // Verify vehicle exists
    const vehicle = await db.collection("tblvehicles").findOne({
      license_plate: license_plate.toUpperCase(),
      isDeleted: { $ne: true },
    });

    if (!vehicle) {
      return NextResponse.json(
        { error: "Vehicle not found or deleted" },
        { status: 400 }
      );
    }

    // Verify unit exists and is distance type
    const unit = await db.collection("tblunits").findOne({
      unit_id,
      type: "distance",
    });

    if (!unit) {
      return NextResponse.json(
        { error: "Invalid distance unit" },
        { status: 400 }
      );
    }

    // Calculate distance
    const distance_calculated = calculateDistance(body);

    if (distance_calculated <= 0) {
      return NextResponse.json(
        { error: "Calculated distance must be greater than 0" },
        { status: 400 }
      );
    }

    const tripData: Omit<Trip, "_id"> = {
      license_plate: license_plate.toUpperCase(),
      distance_calculated,
      mode,
      date: new Date(date),
      unit_id,
      notes: notes || "",
      created_at: new Date(),
    };

    // Add mode-specific fields
    if (mode === "distance") {
      tripData.trip_distance = body.trip_distance;
    } else {
      tripData.start_odometer = body.start_odometer;
      tripData.end_odometer = body.end_odometer;
    }

    const result = await db.collection(COLLECTION).insertOne(tripData);

    return NextResponse.json(
      { 
        _id: result.insertedId,
        message: "Trip logged successfully",
        distance: distance_calculated
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/trips error:", error);
    return NextResponse.json(
      { error: "Failed to create trip log" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid or missing trip ID" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const db = await connectToDatabase();

    // Build update data
    const updateData: any = {};
    
    if (body.date) updateData.date = new Date(body.date);
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.unit_id) {
      // Verify unit exists
      const unit = await db.collection("tblunits").findOne({
        unit_id: body.unit_id,
        type: "distance",
      });
      if (!unit) {
        return NextResponse.json(
          { error: "Invalid distance unit" },
          { status: 400 }
        );
      }
      updateData.unit_id = body.unit_id;
    }

    // Handle mode updates
    if (body.mode) {
      updateData.mode = body.mode;
      
      if (body.mode === "distance" && body.trip_distance !== undefined) {
        updateData.trip_distance = body.trip_distance;
        updateData.distance_calculated = body.trip_distance;
        // Clear odometer fields
        updateData.start_odometer = null;
        updateData.end_odometer = null;
      } else if (body.mode === "odometer") {
        if (body.start_odometer !== undefined) updateData.start_odometer = body.start_odometer;
        if (body.end_odometer !== undefined) updateData.end_odometer = body.end_odometer;
        if (body.start_odometer !== undefined && body.end_odometer !== undefined) {
          updateData.distance_calculated = body.end_odometer - body.start_odometer;
        }
        // Clear trip_distance field
        updateData.trip_distance = null;
      }
    } else {
      // Mode not changing, just update values
      if (body.trip_distance !== undefined) {
        updateData.trip_distance = body.trip_distance;
        updateData.distance_calculated = body.trip_distance;
      }
      if (body.start_odometer !== undefined) updateData.start_odometer = body.start_odometer;
      if (body.end_odometer !== undefined) updateData.end_odometer = body.end_odometer;
      if (body.start_odometer !== undefined && body.end_odometer !== undefined) {
        updateData.distance_calculated = body.end_odometer - body.start_odometer;
      }
    }

    const result = await db
      .collection(COLLECTION)
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Trip not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Trip updated successfully" });
  } catch (error) {
    console.error("PUT /api/trips error:", error);
    return NextResponse.json(
      { error: "Failed to update trip" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid or missing trip ID" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Trip not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Trip deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/trips error:", error);
    return NextResponse.json(
      { error: "Failed to delete trip" },
      { status: 500 }
    );
  }
}