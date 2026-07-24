// app/api/trips/exceptions/route.ts
//
// PHASE 1: exception analytics (duration outliers, odometer
// inconsistencies, possible duplicates, missing driver), equivalent in
// spirit to Expense's outliers endpoint. Mirrors
// app/api/trips/stats/route.ts's auth wiring exactly.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getTripExceptions(req),
  { permission: Permission.TRIP_VIEW }
);
