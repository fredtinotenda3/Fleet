// app/api/plugins/registry/route.ts

import { NextRequest } from 'next/server';
import { pluginController } from '@/modules/plugins/controllers/plugin.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

// GET is viewable by anyone who can see plugins at all (browsing the
// catalogue to decide what to install). POST (registering a brand new
// plugin into the catalogue) is restricted to platform staff — mirrors
// how app/api/platform/**/route.ts gates on the literal super_admin role
// rather than the broader isSuperAdmin flag, since organization_owner
// must not be able to add arbitrary plugins to the global catalogue.
export const GET = withAuth(
  (req: NextRequest) => pluginController.listCatalogue(req),
  { permission: Permission.PLUGIN_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => pluginController.registerPlugin(req),
  { permission: Permission.PLUGIN_REGISTER }
);