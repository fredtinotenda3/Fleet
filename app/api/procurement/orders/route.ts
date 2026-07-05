// app/api/procurement/orders/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { procurementController } from '@/modules/procurement/controllers/procurement.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => procurementController.listOrders(req), { permission: Permission.PROCUREMENT_VIEW });
export const POST = withAuth((req) => procurementController.createOrder(req), { permission: Permission.PROCUREMENT_MANAGE });