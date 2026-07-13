// app/api/fuel-cards/[id]/route.ts
//
// FIX (🔴 Critical — no auth of any kind): same class of bug as
// app/api/fuel-cards/route.ts. See that file's comment for the
// FUEL_VIEW/FUEL_EDIT/FUEL_DELETE stopgap-permission reasoning.

import { NextRequest } from 'next/server';
import { fuelCardController } from '@/modules/fuel-cards/controllers/fuel-card.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return fuelCardController.getById(req, id);
  },
  { permission: Permission.FUEL_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return fuelCardController.update(req, id);
  },
  { permission: Permission.FUEL_EDIT }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return fuelCardController.remove(req, id);
  },
  { permission: Permission.FUEL_DELETE }
);