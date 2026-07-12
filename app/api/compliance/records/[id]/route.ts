// app/api/compliance/records/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { complianceController } from '@/modules/compliance/controllers/compliance.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return complianceController.get(req, id);
  },
  { permission: Permission.COMPLIANCE_VIEW }
);