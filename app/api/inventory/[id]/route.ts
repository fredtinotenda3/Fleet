// app/api/inventory/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { inventoryController } from '@/modules/inventory/controllers/inventory.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return inventoryController.getPart(req, id);
  },
  { permission: Permission.INVENTORY_VIEW }
);
export const PUT = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return inventoryController.updatePart(req, id);
  },
  { permission: Permission.INVENTORY_MANAGE }
);