// app/api/fuel-stations/route.ts
//
// FIX (🔴 Critical — no auth of any kind): same class of bug as
// app/api/fuel-cards/route.ts. See that file's comment.

import { NextRequest } from 'next/server';
import { fuelStationController } from '@/modules/fuel-stations/controllers/fuel-station.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => fuelStationController.list(req),
  { permission: Permission.FUEL_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => fuelStationController.create(req),
  { permission: Permission.FUEL_CREATE }
);