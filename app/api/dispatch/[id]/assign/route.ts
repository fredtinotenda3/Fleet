// app/api/dispatch/[id]/assign/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { dispatchController } from '@/modules/dispatch/controllers/dispatch.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return dispatchController.assign(req, id);
  },
  { permission: Permission.DISPATCH_ASSIGN }
);