// app/api/inventory/[id]/adjust/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { inventoryController } from '@/modules/inventory/controllers/inventory.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => inventoryController.adjustStock(req, (ctx as any).params.id), { permission: Permission.INVENTORY_ADJUST });