// app/api/plugins/[id]/disable/route.ts

import { NextRequest } from 'next/server';
import { pluginController } from '@/modules/plugins/controllers/plugin.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return pluginController.disable(req, id);
  },
  { permission: Permission.PLUGIN_MANAGE }
);