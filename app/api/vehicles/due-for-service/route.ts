//app/api/vehicles/due-for-service/route.ts

import { vehicleController } from '@/modules/vehicles/controllers/vehicle.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req) => vehicleController.getVehiclesDueForService(req),
  { permission: Permission.VEHICLE_VIEW }
);