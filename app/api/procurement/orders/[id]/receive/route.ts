// app/api/procurement/orders/[id]/receive/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { procurementController } from '@/modules/procurement/controllers/procurement.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return procurementController.receiveOrder(req, id);
  },
  { permission: Permission.PROCUREMENT_MANAGE }
);