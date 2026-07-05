// app/api/procurement/orders/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { procurementController } from '@/modules/procurement/controllers/procurement.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req, ctx) => procurementController.getOrder(req, (ctx as any).params.id), { permission: Permission.PROCUREMENT_VIEW });