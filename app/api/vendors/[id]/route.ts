// app/api/vendors/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { vendorController } from '@/modules/vendors/controllers/vendor.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return vendorController.get(req, id);
  },
  { permission: Permission.VENDOR_VIEW }
);
export const PUT = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return vendorController.update(req, id);
  },
  { permission: Permission.VENDOR_MANAGE }
);
export const DELETE = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return vendorController.delete(req, id);
  },
  { permission: Permission.VENDOR_MANAGE }
);