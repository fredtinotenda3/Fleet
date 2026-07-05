// app/api/digital-twin/route.ts

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { digitalTwinController } from '@/modules/digital-twin/controllers/digital-twin.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req: NextRequest) => {
  const action = req.nextUrl.searchParams.get('action');
  if (action === 'summary') return digitalTwinController.getFleetSummary(req);
  return digitalTwinController.listTwins(req);
}, { permission: Permission.VEHICLE_VIEW });