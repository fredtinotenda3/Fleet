// app/api/telematics/live-map/route.ts

import { NextRequest } from 'next/server';
import { liveMapController } from '@/modules/telematics/controllers/live-map.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => liveMapController.getLiveMap(req),
  { permission: Permission.VEHICLE_VIEW }
);