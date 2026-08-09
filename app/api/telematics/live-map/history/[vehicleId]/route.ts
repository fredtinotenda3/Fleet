// app/api/telematics/live-map/history/[vehicleId]/route.ts
//
// GET /api/telematics/live-map/history/[vehicleId]?minutes=60
//
// Same permission as the live map itself (VEHICLE_VIEW) and the same
// org-unit scoping path (resolveTenantContext -> getTelematicsHistoryInScope,
// see LiveMapService.getVehicleRouteHistory) -- a vehicle outside the
// caller's scope returns an empty trail, not another org unit's route.

import { NextRequest } from 'next/server';
import { liveMapController } from '@/modules/telematics/controllers/live-map.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ vehicleId: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { vehicleId } = await params;
    return liveMapController.getRouteHistory(req, vehicleId);
  },
  { permission: Permission.VEHICLE_VIEW }
);