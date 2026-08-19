// app/api/telematics/eagletrack/sync/route.ts

import { NextRequest } from 'next/server';
import { eagletrackController } from '@/modules/telematics/controllers/eagletrack.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => eagletrackController.syncNow(req),
  { permission: Permission.VEHICLE_EDIT }
);
