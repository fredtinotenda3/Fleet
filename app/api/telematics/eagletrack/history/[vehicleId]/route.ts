// app/api/telematics/eagletrack/history/[vehicleId]/route.ts
//
// GET /api/telematics/eagletrack/history/[vehicleId]?from=&to=&includeAlerts=
//
// VEHICLE_VIEW, matching the live map and its route history: this
// returns the same class of data (a GPS trail for one vehicle), just
// over a wider window and backfilled from the provider on the way. It
// does WRITE (idempotent history ingestion), but the write is a cache
// fill of the provider's own record rather than a user-authored change,
// so gating it on VEHICLE_EDIT would stop viewers seeing a route for no
// security benefit.
//
// Org-unit scoping is enforced twice: assertVehicleInScope before any
// vendor request is made, and getTelematicsHistoryInScope on the way
// back out.

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
    return eagletrackController.getHistory(req, vehicleId);
  },
  {
    permission: Permission.VEHICLE_VIEW,
    // Each call can fan out to a paged vendor pull, so this one is rate
    // limited where the plain live-map reads are not.
    rateLimit: true,
  }
);
