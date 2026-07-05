// app/api/vendors/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { vendorController } from '@/modules/vendors/controllers/vendor.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => vendorController.list(req), { permission: Permission.VENDOR_VIEW });
export const POST = withAuth((req) => vendorController.create(req), { permission: Permission.VENDOR_MANAGE });