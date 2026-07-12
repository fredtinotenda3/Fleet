// app/api/workshop/assignments/[id]/release/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workshopController } from '@/modules/workshop/controllers/workshop.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return workshopController.releaseMechanic(req, id);
  },
  { permission: Permission.WORKSHOP_MANAGE }
);