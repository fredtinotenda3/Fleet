// app/api/telematics/live-map/vehicle/[vehicleId]/route.ts
//
// GET /api/telematics/live-map/vehicle/[vehicleId]
//
// Same permission (VEHICLE_VIEW) and the same org-unit scoping path
// (resolveTenantContext -> getLatestTelematicsDataInScope, see
// LiveMapService.getVehicleDetail) as the live map itself and its route
// history -- a vehicle outside the caller's scope gets `null`, not
// another org unit's telemetry.

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
    return liveMapController.getVehicleDetail(req, vehicleId);
  },
  { permission: Permission.VEHICLE_VIEW }
);