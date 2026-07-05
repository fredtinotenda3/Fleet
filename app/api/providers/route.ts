// app/api/providers/route.ts

import { NextRequest } from 'next/server';
import { externalProviderController } from '@/modules/oauth/controllers/external-provider.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => externalProviderController.listProviders(req),
  { permission: Permission.SSO_CONNECTION_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => externalProviderController.createProvider(req),
  { permission: Permission.SSO_CONNECTION_MANAGE }
);