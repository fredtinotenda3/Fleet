// app/api/drivers/[id]/route.ts
//
// Same VEHICLE_* permission stopgap as app/api/drivers/route.ts -- see
// that file's comment.

import { NextRequest } from 'next/server';
import { driverController } from '@/modules/drivers/controllers/driver.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return driverController.getById(req, id);
  },
  { permission: Permission.VEHICLE_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return driverController.update(req, id);
  },
  { permission: Permission.VEHICLE_EDIT }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return driverController.remove(req, id);
  },
  { permission: Permission.VEHICLE_DELETE }
);