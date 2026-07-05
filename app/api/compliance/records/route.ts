// app/api/compliance/records/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { complianceController } from '@/modules/compliance/controllers/compliance.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => complianceController.list(req), { permission: Permission.COMPLIANCE_VIEW });
export const POST = withAuth((req) => complianceController.createRecord(req), { permission: Permission.COMPLIANCE_MANAGE });