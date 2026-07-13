// app/api/fuellogs/import/route.ts
//
// FIX (🟠 High -- missing route / broken feature): FuelController
// already implements importFuelLogs(), unreachable with no route.
import { NextRequest } from 'next/server';
import { fuelController } from '@/modules/fuel/controllers/fuel.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => fuelController.importFuelLogs(req),
  { permission: Permission.FUEL_CREATE }
);