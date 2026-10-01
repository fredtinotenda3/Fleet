//app/api/vehicles/[id]/route.ts

import { vehicleController } from '@/modules/vehicles/controllers/vehicle.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return vehicleController.getVehicle(req, id);
  },
  { permission: Permission.VEHICLE_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return vehicleController.updateVehicle(req, id);
  },
  { permission: Permission.VEHICLE_EDIT }
);

export const DELETE = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return vehicleController.deleteVehicle(req, id);
  },
  { permission: Permission.VEHICLE_DELETE }
);