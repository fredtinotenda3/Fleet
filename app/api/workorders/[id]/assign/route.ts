// app/api/workorders/[id]/assign/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workOrderController } from '@/modules/workorders/controllers/workorder.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return workOrderController.assign(req, id);
  },
  { permission: Permission.WORKORDER_ASSIGN }
);