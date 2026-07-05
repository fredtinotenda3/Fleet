// app/api/digital-twin/[vehicleId]/rebuild/route.ts

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { digitalTwinController } from '@/modules/digital-twin/controllers/digital-twin.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ vehicleId: string }>;
}

export const POST = withAuth(async (req: NextRequest, _ctx, { params }: RouteParams) => {
  const { vehicleId } = await params;
  return digitalTwinController.rebuildTwin(req, vehicleId);
}, { permission: Permission.VEHICLE_EDIT });