// app/api/compliance/records/[id]/waive/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { complianceController } from '@/modules/compliance/controllers/compliance.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => complianceController.waiveRecord(req, (ctx as any).params.id), { permission: Permission.COMPLIANCE_MANAGE });