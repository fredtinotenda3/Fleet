// app/api/plugins/route.ts

import { NextRequest } from 'next/server';
import { pluginController } from '@/modules/plugins/controllers/plugin.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => pluginController.listInstalled(req),
  { permission: Permission.PLUGIN_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => pluginController.install(req),
  { permission: Permission.PLUGIN_MANAGE }
);