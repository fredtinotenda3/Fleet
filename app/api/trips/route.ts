// app/api/trips/route.ts
//
// FIX (High — duplicate auth strategies): converted from legacy
// requireAuth() to withAuth + Permission, matching the rest of the
// mature modules. Permission.TRIP_VIEW / TRIP_CREATE confirmed against
// server/permissions/roles.ts.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getTrips(req),
  { permission: Permission.TRIP_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => tripController.createTrip(req),
  { permission: Permission.TRIP_CREATE }
);