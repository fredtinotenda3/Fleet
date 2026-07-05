// app/api/compliance/rules/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { complianceController } from '@/modules/compliance/controllers/compliance.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => complianceController.listRules(req), { permission: Permission.COMPLIANCE_VIEW });
export const POST = withAuth((req) => complianceController.createRule(req), { permission: Permission.COMPLIANCE_MANAGE });