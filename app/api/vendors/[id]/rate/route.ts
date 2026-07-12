// app/api/vendors/[id]/rate/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { vendorController } from '@/modules/vendors/controllers/vendor.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return vendorController.rate(req, id);
  },
  { permission: Permission.VENDOR_MANAGE }
);