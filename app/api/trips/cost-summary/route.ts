
//app/api/trips/cost-summary/route.ts

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  (req: NextRequest) => tripController.getTripCostSummary(req),
  { permission: Permission.TRIP_VIEW }
);