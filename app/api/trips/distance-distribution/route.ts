// app/api/trips/distance-distribution/route.ts
//
// PHASE 2: distance distribution histogram for the Trip Analytics page.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getTripDistanceDistribution(req),
  { permission: Permission.TRIP_VIEW }
);