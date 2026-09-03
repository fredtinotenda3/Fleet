//app/api/vehicles/[id]/driver/route.ts

import { vehicleController } from '@/modules/vehicles/controllers/vehicle.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Assign, change, or clear the vehicle's current driver.
 * Body: { driverId: string | null }. `null`/omitted clears the
 * assignment. See docs/DRIVER_VEHICLE_ASSIGNMENT_MISSING_BACKEND.md.
 */
export const PATCH = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return vehicleController.assignVehicleDriver(req, id);
  },
  { permission: Permission.DRIVER_ASSIGN }
);
