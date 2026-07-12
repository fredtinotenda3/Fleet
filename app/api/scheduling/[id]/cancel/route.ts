// app/api/scheduling/[id]/cancel/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { schedulingController } from '@/modules/scheduling/controllers/scheduling.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return schedulingController.cancel(req, id);
  },
  { permission: Permission.SCHEDULE_SHIFT_MANAGE }
);