// app/api/telematics/eagletrack/triggers/route.ts
//
// GET /api/telematics/eagletrack/triggers
//
// The provider's geofence/speed/idle/stop/route/custom trigger objects
// as last synced. VEHICLE_VIEW: a trigger list describes where and how
// fast this fleet is expected to operate, which is the same sensitivity
// as the geofences already returned by the live map.
//
// Scoped "mine OR unassigned" (see EagleTrackTriggerRepository.listInScope)
// -- an account-wide trigger belongs to no branch and stays visible to
// all of them, exactly as an unassigned depot geofence does.

import { NextRequest } from 'next/server';
import { eagletrackController } from '@/modules/telematics/controllers/eagletrack.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => eagletrackController.listTriggers(req),
  { permission: Permission.VEHICLE_VIEW }
);
