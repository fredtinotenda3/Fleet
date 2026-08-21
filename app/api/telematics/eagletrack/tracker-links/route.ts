// app/api/telematics/eagletrack/tracker-links/route.ts
//
// GET  /api/telematics/eagletrack/tracker-links -- unmatched trackers
//      from the last sync, plus the links this caller can see.
// POST /api/telematics/eagletrack/tracker-links -- link a uin to a
//      vehicle.
//
// VEHICLE_EDIT, not ORG_SETTINGS. A link decides which vehicle a
// tracker's telemetry is attributed to, which is fleet data rather than
// an organization-wide credential -- and the write is already bounded to
// vehicles the caller can see, so a branch manager can maintain their
// own branch's trackers without being handed the Eagle Track token
// screen as well. Least privilege in the direction that matters.

import { NextRequest } from 'next/server';
import { eagletrackController } from '@/modules/telematics/controllers/eagletrack.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => eagletrackController.getTrackerMapping(req),
  { permission: Permission.VEHICLE_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => eagletrackController.createTrackerLink(req),
  { permission: Permission.VEHICLE_EDIT }
);
