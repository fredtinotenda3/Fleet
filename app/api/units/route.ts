// app/api/units/route.ts
//
// FIX (High — duplicate auth strategies): converted from legacy
// requireAuth() to withAuth + Permission.
// NOTE 1: server/permissions/roles.ts has no dedicated units-of-measure
// permission (the existing Permission.ORG_UNIT_* members are a
// different concept — organizational units, not measurement units).
// Mapped to Permission.ORG_VIEW (view) / ORG_SETTINGS (create/edit/
// delete) as a stopgap, since unit definitions are effectively system
// configuration. Flag for a dedicated UOM_* permission if these
// shouldn't be gated by the same permission as org settings.
// NOTE 2: unlike tblmeterlogs, this collection is NOT tenant-scoped.
// That may be intentional (units like "km"/"L" are typically global
// reference data shared across tenants) rather than the same bug
// class as Critical #4 — flagging for confirmation rather than
// changing data scope without knowing intent.

import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { ObjectId, Filter } from "mongodb";
import { Unit } from "@/types";
import { withAuth } from "@/server/middleware/with-auth";
import { Permission } from "@/server/permissions/roles";

const COLLECTION = "tblunits";

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const db = await connectToDatabase();

    const query: Filter<Unit> = {};
    if (type) {
      // Cast is safe here: the DB only ever stores the three literal
      // values below, and an unrecognized `type` query param should
      // simply match nothing rather than fail the request.
      query.type = type.toLowerCase() as Unit["type"];
    }

    const units = await db
      .collection<Unit>(COLLECTION)
      .find(query)
      .project({ unit_id: 1, name: 1, symbol: 1, type: 1 })
      .toArray();
    return NextResponse.json(units);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch units" }, { status: 500 });
  }
}, { permission: Permission.ORG_VIEW });

export const POST = withAuth(async (req: NextRequest) => {
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
      return NextResponse.json({ error: "Unit ID already exists" }, { status: 400 });
    }
    const result = await db.collection(COLLECTION).insertOne({
      unit_id, name, symbol, type, createdAt: new Date(),
    });
    return NextResponse.json({ _id: result.insertedId, unit_id, name, symbol, type }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create unit" }, { status: 500 });
  }
}, { permission: Permission.ORG_SETTINGS });

export const PUT = withAuth(async (req: NextRequest) => {
  try {
    const { _id, ...updateData } = await req.json();
    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json({ error: "Valid unit ID required" }, { status: 400 });
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
    return NextResponse.json({ error: "Failed to update unit" }, { status: 500 });
  }
}, { permission: Permission.ORG_SETTINGS });

export const DELETE = withAuth(async (req: NextRequest) => {
  try {
    const { _id } = await req.json();
    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json({ error: "Valid unit ID required" }, { status: 400 });
    }
    const db = await connectToDatabase();
    const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(_id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete unit" }, { status: 500 });
  }
}, { permission: Permission.ORG_SETTINGS });