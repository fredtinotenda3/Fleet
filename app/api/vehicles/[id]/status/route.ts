//app/api/vehicles/[id]/status/route.ts

import { vehicleController } from '@/modules/vehicles/controllers/vehicle.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return vehicleController.updateVehicleStatus(req, id);
  },
  { permission: Permission.VEHICLE_EDIT }
);