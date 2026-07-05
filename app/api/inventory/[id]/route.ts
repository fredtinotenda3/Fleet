// app/api/inventory/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { inventoryController } from '@/modules/inventory/controllers/inventory.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req, ctx) => inventoryController.getPart(req, (ctx as any).params.id), { permission: Permission.INVENTORY_VIEW });
export const PUT = withAuth((req, ctx) => inventoryController.updatePart(req, (ctx as any).params.id), { permission: Permission.INVENTORY_MANAGE });