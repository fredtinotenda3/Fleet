// app/api/procurement/orders/[id]/receive/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { procurementController } from '@/modules/procurement/controllers/procurement.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => procurementController.receiveOrder(req, (ctx as any).params.id), { permission: Permission.PROCUREMENT_MANAGE });