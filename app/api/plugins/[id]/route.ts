// app/api/plugins/[id]/route.ts

import { NextRequest } from 'next/server';
import { pluginController } from '@/modules/plugins/controllers/plugin.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return pluginController.getInstallation(req, id);
  },
  { permission: Permission.PLUGIN_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return pluginController.update(req, id);
  },
  { permission: Permission.PLUGIN_MANAGE }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return pluginController.uninstall(req, id);
  },
  { permission: Permission.PLUGIN_MANAGE }
);