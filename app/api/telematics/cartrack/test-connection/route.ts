// app/api/telematics/cartrack/test-connection/route.ts

import { NextRequest } from 'next/server';
import { cartrackController } from '@/modules/telematics/controllers/cartrack.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => cartrackController.testConnection(req),
  { permission: Permission.ORG_SETTINGS }
);