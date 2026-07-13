// app/api/geofences/route.ts
//
// FIX (🔴 Critical — no auth of any kind): this route had no auth
// wrapper. No dedicated telematics/geofence permission exists in
// server/permissions/roles.ts, so this uses Permission.VEHICLE_VIEW /
// VEHICLE_EDIT as a stopgap (geofences are vehicle-location config).
// Flag for a dedicated permission if this needs finer-grained control.

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => telematicsController.listGeofences(req),
  { permission: Permission.VEHICLE_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => telematicsController.createGeofence(req),
  { permission: Permission.VEHICLE_EDIT }
);