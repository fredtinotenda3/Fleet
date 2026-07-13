// app/api/trips/import/route.ts
import { NextRequest } from 'next/server';
import { tripController } from '@/modules/trips/controllers/trip.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => tripController.importTrips(req),
  { permission: Permission.TRIP_CREATE }
);