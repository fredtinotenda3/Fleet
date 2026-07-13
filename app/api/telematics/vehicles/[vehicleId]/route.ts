// app/api/telematics/vehicles/[vehicleId]/route.ts
//
// FIX (🔴 Critical — no auth of any kind): this route had no auth
// wrapper — live vehicle location and location history were readable
// by anyone. Permission.VEHICLE_VIEW stopgap, matching geofences.

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ vehicleId: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { vehicleId } = await params;
    const hasRange = req.nextUrl.searchParams.has('startDate');
    return hasRange
      ? telematicsController.getHistory(req, vehicleId)
      : telematicsController.getCurrentLocation(req, vehicleId);
  },
  { permission: Permission.VEHICLE_VIEW }
);