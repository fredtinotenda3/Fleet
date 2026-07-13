// app/api/telematics/vehicles/[vehicleId]/alerts/route.ts
//
// FIX (🔴 Critical — no auth of any kind): same class of bug as
// app/api/telematics/vehicles/[vehicleId]/route.ts.

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
    return telematicsController.getActiveAlerts(req, vehicleId);
  },
  { permission: Permission.VEHICLE_VIEW }
);