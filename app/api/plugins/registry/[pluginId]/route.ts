// app/api/plugins/registry/[pluginId]/route.ts

import { NextRequest } from 'next/server';
import { pluginController } from '@/modules/plugins/controllers/plugin.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ pluginId: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { pluginId } = await params;
    return pluginController.getManifest(req, pluginId);
  },
  { permission: Permission.PLUGIN_VIEW }
);