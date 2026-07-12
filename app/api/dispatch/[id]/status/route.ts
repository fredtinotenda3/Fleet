// app/api/dispatch/[id]/status/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { dispatchController } from '@/modules/dispatch/controllers/dispatch.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PUT = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return dispatchController.changeStatus(req, id);
  },
  { permission: Permission.DISPATCH_MANAGE }
);