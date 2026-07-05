// app/api/vendors/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { vendorController } from '@/modules/vendors/controllers/vendor.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req, ctx) => vendorController.get(req, (ctx as any).params.id), { permission: Permission.VENDOR_VIEW });
export const PUT = withAuth((req, ctx) => vendorController.update(req, (ctx as any).params.id), { permission: Permission.VENDOR_MANAGE });
export const DELETE = withAuth((req, ctx) => vendorController.delete(req, (ctx as any).params.id), { permission: Permission.VENDOR_MANAGE });