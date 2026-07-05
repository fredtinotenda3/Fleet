// app/api/oauth/clients/route.ts

import { NextRequest } from 'next/server';
import { oauthClientController } from '@/modules/oauth/controllers/oauth-client.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => oauthClientController.listClients(req),
  { permission: Permission.API_KEY_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => oauthClientController.createClient(req),
  { permission: Permission.API_KEY_MANAGE }
);