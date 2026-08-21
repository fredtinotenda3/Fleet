// app/api/telematics/eagletrack/fuel/[vehicleId]/route.ts
//
// GET /api/telematics/eagletrack/fuel/[vehicleId]?from=&to=
//
// FUEL_VIEW rather than VEHICLE_VIEW: this is fuel consumption data and
// belongs behind the same permission as the rest of the fuel module, so
// a role that can see where a vehicle is but not what it costs to run
// stays that way.
//
// The vehicle itself is still org-unit scope-checked (assertVehicleInScope)
// before any vendor request is made.

import { NextRequest } from 'next/server';
import { eagletrackController } from '@/modules/telematics/controllers/eagletrack.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ vehicleId: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { vehicleId } = await params;
    return eagletrackController.getFuelReport(req, vehicleId);
  },
  { permission: Permission.FUEL_VIEW, rateLimit: true }
);
