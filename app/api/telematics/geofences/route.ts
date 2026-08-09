// app/api/telematics/geofences/route.ts
//
// Wires up TelematicsController.listGeofences/createGeofence, which
// existed in modules/telematics/controllers/telematics.controller.ts
// with no route pointing at them yet.

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => telematicsController.listGeofences(req),
  { permission: Permission.VEHICLE_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => telematicsController.createGeofence(req),
  { permission: Permission.VEHICLE_EDIT }
);