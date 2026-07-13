// app/api/telematics/alerts/[alertId]/acknowledge/route.ts
//
// FIX (🔴 Critical — no auth of any kind): same class of bug as the
// other telematics/** routes — this one is a mutation, so gated on
// VEHICLE_EDIT rather than VEHICLE_VIEW.

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ alertId: string }>;
}

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { alertId } = await params;
    return telematicsController.acknowledgeAlert(req, alertId);
  },
  { permission: Permission.VEHICLE_EDIT }
);