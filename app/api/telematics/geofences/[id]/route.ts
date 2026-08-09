// app/api/telematics/geofences/[id]/route.ts
//
// Wires up TelematicsController.updateGeofence/deleteGeofence, which
// existed with no route pointing at them yet.

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