//app/api/vehicles/stats/route.ts

import { vehicleController } from '@/modules/vehicles/controllers/vehicle.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req) => vehicleController.getVehicleStats(req),
  { permission: Permission.VEHICLE_VIEW }
);