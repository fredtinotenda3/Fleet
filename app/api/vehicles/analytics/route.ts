//app/api/vehicles/analytics/route.ts

import { vehicleController } from '@/modules/vehicles/controllers/vehicle.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req) => vehicleController.getVehicleAnalytics(req),
  { permission: Permission.ANALYTICS_VIEW }
);