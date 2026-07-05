// app/api/procurement/requests/[id]/reject/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { procurementController } from '@/modules/procurement/controllers/procurement.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => procurementController.rejectRequest(req, (ctx as any).params.id), { permission: Permission.PROCUREMENT_APPROVE });