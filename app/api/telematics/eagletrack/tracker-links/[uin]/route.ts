// app/api/telematics/eagletrack/tracker-links/[uin]/route.ts
//
// DELETE /api/telematics/eagletrack/tracker-links/[uin]
//
// Scope is part of the delete FILTER (removeInScope), not a check
// performed afterwards, so a caller outside the link's org unit removes
// nothing and gets a 404 -- indistinguishable from "no such link", which
// is the correct amount of information to give someone asking about
// another branch's trackers.

import { NextRequest } from 'next/server';
import { eagletrackController } from '@/modules/telematics/controllers/eagletrack.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ uin: string }>;
}

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { uin } = await params;
    return eagletrackController.deleteTrackerLink(req, uin);
  },
  { permission: Permission.VEHICLE_EDIT }
);
