// app/api/security/org-units/route.ts

import { NextRequest } from 'next/server';
import { orgUnitController } from '@/modules/security/controllers/org-unit.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => orgUnitController.listOrgUnits(req),
  { permission: Permission.ORG_UNIT_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => orgUnitController.createOrgUnit(req),
  { permission: Permission.ORG_UNIT_MANAGE }
);