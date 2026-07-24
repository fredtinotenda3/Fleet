// app/api/trips/kpis/route.ts
//
// PHASE 1: executive KPI cards for the Trip Analytics page. Mirrors
// app/api/trips/stats/route.ts's auth wiring exactly (withAuth +
// Permission.TRIP_VIEW).

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getTripKpis(req),
  { permission: Permission.TRIP_VIEW }
);
