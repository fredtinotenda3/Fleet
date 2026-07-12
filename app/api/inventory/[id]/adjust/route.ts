// app/api/inventory/[id]/adjust/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { inventoryController } from '@/modules/inventory/controllers/inventory.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return inventoryController.adjustStock(req, id);
  },
  { permission: Permission.INVENTORY_ADJUST }
);