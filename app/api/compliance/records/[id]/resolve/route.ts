// app/api/compliance/records/[id]/resolve/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { complianceController } from '@/modules/compliance/controllers/compliance.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return complianceController.resolveRecord(req, id);
  },
  { permission: Permission.COMPLIANCE_MANAGE }
);