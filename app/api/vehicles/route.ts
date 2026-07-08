//app/api/vehicles/route.ts

import { vehicleController } from '@/modules/vehicles/controllers/vehicle.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req) => vehicleController.getVehicles(req),
  { permission: Permission.VEHICLE_VIEW }
);

export const POST = withAuth(
  (req) => vehicleController.createVehicle(req),
  { permission: Permission.VEHICLE_CREATE }
);