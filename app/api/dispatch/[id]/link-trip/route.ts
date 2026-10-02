// app/api/dispatch/[id]/link-trip/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { dispatchController } from '@/modules/dispatch/controllers/dispatch.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return dispatchController.linkTrip(req, id);
  },
  { permission: Permission.DISPATCH_MANAGE }
);
