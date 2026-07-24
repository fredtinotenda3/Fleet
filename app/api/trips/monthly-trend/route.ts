// app/api/trips/monthly-trend/route.ts
//
// PHASE 2: monthly trip trend for the Trip Analytics page. Mirrors
// app/api/trips/kpis/route.ts's auth wiring exactly.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getMonthlyTripTrend(req),
  { permission: Permission.TRIP_VIEW }
);