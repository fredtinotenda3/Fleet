// app/api/workshop/bays/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workshopController } from '@/modules/workshop/controllers/workshop.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return workshopController.getBay(req, id);
  },
  { permission: Permission.WORKSHOP_VIEW }
);
export const PUT = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return workshopController.updateBay(req, id);
  },
  { permission: Permission.WORKSHOP_MANAGE }
);