// app/api/geofences/[id]/route.ts
//
// FIX (🔴 Critical — no auth of any kind): same class of bug as
// app/api/geofences/route.ts. See that file's comment.

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return telematicsController.updateGeofence(req, id);
  },
  { permission: Permission.VEHICLE_EDIT }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return telematicsController.deleteGeofence(req, id);
  },
  { permission: Permission.VEHICLE_EDIT }
);