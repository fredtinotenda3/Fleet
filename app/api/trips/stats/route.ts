// app/api/trips/stats/route.ts
//
// FIX (High — duplicate auth strategies): converted from legacy
// requireAuth() to withAuth + Permission.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getTripStats(req),
  { permission: Permission.TRIP_VIEW }
);