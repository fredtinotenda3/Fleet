// app/api/tenancy/org-units/route.ts
//
// GET routed through OrgUnitController (plain listing). POST routed through
// TenancyController.createOrgUnit, which enforces the hierarchy-nesting
// rules (HierarchyValidationService) that OrgUnitService's plain
// createOrgUnit does not know about.

import { NextRequest } from 'next/server';
import { orgUnitController } from '@/modules/security/controllers/org-unit.controller';
import { tenancyController } from '@/modules/tenancy/controllers/tenancy.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => orgUnitController.listOrgUnits(req),
  { permission: Permission.ORG_UNIT_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => tenancyController.createOrgUnit(req),
  { permission: Permission.ORG_UNIT_MANAGE }
);