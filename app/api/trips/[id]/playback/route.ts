// app/api/trips/[id]/playback/route.ts
//
// The telemetry track a trip was derived from, ordered and offset from
// the trip's start so a timeline scrubber can seek on it.
//
// The route is intentionally thin. All the scope reasoning lives in
// modules/trips/services/trip-playback.service.ts: the trip is loaded
// under the caller's org-unit scope first, an out-of-scope trip is
// reported as NOT FOUND (never as forbidden, which would let a
// scope-narrowed caller enumerate another branch's trips one id at a
// time), and the vehicle whose telemetry is read comes from the trip
// record rather than from the request.
//
// TRIP_VIEW, matching the trip detail endpoint it expands on.

import { NextRequest } from 'next/server';
import { tripController } from '@/modules/trips/controllers/trip.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return tripController.getPlayback(req, id);
  },
  { permission: Permission.TRIP_VIEW }
);
