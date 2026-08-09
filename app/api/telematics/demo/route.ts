// app/api/telematics/demo/route.ts

import { NextRequest } from 'next/server';
import { demoController } from '@/modules/telematics/controllers/demo.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => demoController.getStatus(req),
  { permission: Permission.VEHICLE_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => demoController.setStatus(req),
  { permission: Permission.VEHICLE_EDIT }
);