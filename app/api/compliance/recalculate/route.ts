// app/api/compliance/recalculate/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { complianceController } from '@/modules/compliance/controllers/compliance.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req) => complianceController.recalculate(req), { permission: Permission.COMPLIANCE_MANAGE });