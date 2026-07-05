// app/api/vendors/[id]/rate/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { vendorController } from '@/modules/vendors/controllers/vendor.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => vendorController.rate(req, (ctx as any).params.id), { permission: Permission.VENDOR_MANAGE });