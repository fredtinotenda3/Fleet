// app/api/meterlogs/last/route.ts
//
// FIX (High — duplicate auth strategies): converted from legacy
// requireAuth() to withAuth + Permission. Tenant scoping (previously
// fixed for the Critical cross-tenant leak) is unchanged. No dedicated
// meter-log permission exists in server/permissions/roles.ts, so this
// maps to Permission.VEHICLE_VIEW (see app/api/meterlogs/route.ts for
// the same reasoning).

import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { withAuth } from "@/server/middleware/with-auth";
import { Permission } from "@/server/permissions/roles";
import { getTenantFromRequest } from "@/server/utils/context.utils";

const COLLECTION = "tblmeterlogs";

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const license_plate = searchParams.get("license_plate");

    if (!license_plate) {
      return NextResponse.json({ error: "license_plate is required" }, { status: 400 });
    }

    const tenantId = await getTenantFromRequest(req);
    const db = await connectToDatabase();
    const lastLog = await db
      .collection(COLLECTION)
      .find({ license_plate: license_plate.toUpperCase(), tenantId })
      .sort({ date: -1 })
      .limit(1)
      .toArray();

    if (!lastLog.length) {
      return NextResponse.json({ message: "No previous logs found", odometer: 0 });
    }

    return NextResponse.json({ odometer: lastLog[0].odometer });
  } catch (error) {
    console.error("Error fetching last odometer:", error);
    return NextResponse.json({ error: "Failed to fetch last odometer" }, { status: 500 });
  }
}, { permission: Permission.VEHICLE_VIEW });