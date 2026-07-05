// app/api/tenancy/org-units/route.ts

import { NextRequest } from 'next/server';
import { tenancyController } from '@/modules/tenancy/controllers/tenancy.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  (req: NextRequest) => tenancyController.createOrgUnit(req),
  { permission: Permission.ORG_UNIT_MANAGE }
);