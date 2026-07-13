// app/api/fuel-stations/[id]/route.ts
//
// FIX (🔴 Critical — no auth of any kind): same class of bug as
// app/api/fuel-cards/route.ts. See that file's comment.

import { NextRequest } from 'next/server';
import { fuelStationController } from '@/modules/fuel-stations/controllers/fuel-station.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return fuelStationController.getById(req, id);
  },
  { permission: Permission.FUEL_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return fuelStationController.update(req, id);
  },
  { permission: Permission.FUEL_EDIT }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return fuelStationController.remove(req, id);
  },
  { permission: Permission.FUEL_DELETE }
);