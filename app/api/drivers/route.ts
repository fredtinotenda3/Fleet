// app/api/drivers/route.ts
//
// PERMISSION STOPGAP: there is no Permission.DRIVER_* enum member yet in
// server/permissions/roles.ts. Following the same documented stopgap
// already applied to meter logs / UOM (mapped onto Permission.VEHICLE_*
// per the July 12 audit), driver reads/writes are gated on the closest
// existing fleet-data permissions: VEHICLE_VIEW to read, VEHICLE_EDIT to
// write. Replace with dedicated DRIVER_VIEW / DRIVER_CREATE / DRIVER_EDIT
// / DRIVER_DELETE entries (and matching rolePermissions rows) once added.

import { NextRequest } from 'next/server';
import { driverController } from '@/modules/drivers/controllers/driver.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => driverController.list(req),
  { permission: Permission.VEHICLE_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => driverController.create(req),
  { permission: Permission.VEHICLE_EDIT }
);
