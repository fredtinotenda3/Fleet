// app/api/providers/discover/route.ts

import { NextRequest } from 'next/server';
import { externalProviderController } from '@/modules/oauth/controllers/external-provider.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => externalProviderController.discover(req),
  { permission: Permission.SSO_CONNECTION_VIEW }
);