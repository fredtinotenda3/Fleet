// app/api/inventory/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { inventoryController } from '@/modules/inventory/controllers/inventory.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => inventoryController.listParts(req), { permission: Permission.INVENTORY_VIEW });
export const POST = withAuth((req) => inventoryController.createPart(req), { permission: Permission.INVENTORY_MANAGE });