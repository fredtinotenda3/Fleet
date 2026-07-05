// app/api/security/api-keys/route.ts

import { NextRequest } from 'next/server';
import { apiKeyController } from '@/modules/security/controllers/api-key.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest, context) => apiKeyController.list(req, context),
  { permission: Permission.API_KEY_VIEW }
);

export const POST = withAuth(
  (req: NextRequest, context) => apiKeyController.create(req, context),
  { permission: Permission.API_KEY_MANAGE }
);