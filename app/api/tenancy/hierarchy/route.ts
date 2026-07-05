// app/api/tenancy/hierarchy/route.ts

import { NextRequest } from 'next/server';
import { tenancyController } from '@/modules/tenancy/controllers/tenancy.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => tenancyController.getHierarchyTree(req),
  { permission: Permission.ORG_UNIT_VIEW }
);