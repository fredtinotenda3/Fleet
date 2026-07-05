// app/api/compliance/records/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { complianceController } from '@/modules/compliance/controllers/compliance.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req, ctx) => complianceController.get(req, (ctx as any).params.id), { permission: Permission.COMPLIANCE_VIEW });