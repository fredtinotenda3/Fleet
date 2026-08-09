// app/api/telematics/cartrack/config/route.ts

import { NextRequest } from 'next/server';
import { cartrackController } from '@/modules/telematics/controllers/cartrack.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => cartrackController.getConfig(req),
  { permission: Permission.ORG_SETTINGS }
);

export const PUT = withAuth(
  async (req: NextRequest) => cartrackController.saveConfig(req),
  { permission: Permission.ORG_SETTINGS }
);