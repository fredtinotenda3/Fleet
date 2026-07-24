// app/api/trips/day-of-week/route.ts
//
// PHASE 2: day-of-week x hour heatmap for the Trip Analytics page.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getTripsByDayOfWeek(req),
  { permission: Permission.TRIP_VIEW }
);