// app/api/telematics/eagletrack/config/route.ts

import { NextRequest } from 'next/server';
import { eagletrackController } from '@/modules/telematics/controllers/eagletrack.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => eagletrackController.getConfig(req),
  { permission: Permission.ORG_SETTINGS }
);

export const PUT = withAuth(
  async (req: NextRequest) => eagletrackController.saveConfig(req),
  { permission: Permission.ORG_SETTINGS }
);
