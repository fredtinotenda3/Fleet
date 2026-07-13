// app/api/vehicles/import/route.ts
//
// FIX (🟠 High -- missing route / broken feature): VehicleController
// already implements importVehicles() (enterprise CSV bulk import
// through the same createVehicle command path as a single create), but
// no route.ts ever wired it up. Wired here, matching the
// expenses/bulk/route.ts pattern.
import { NextRequest } from 'next/server';
import { vehicleController } from '@/modules/vehicles/controllers/vehicle.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => vehicleController.importVehicles(req),
  { permission: Permission.VEHICLE_CREATE }
);