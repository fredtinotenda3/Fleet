// app/api/workorders/[id]/status/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workOrderController } from '@/modules/workorders/controllers/workorder.controller';
import { Permission } from '@/server/permissions/roles';

export const PUT = withAuth((req, ctx) => workOrderController.changeStatus(req, (ctx as any).params.id), { permission: Permission.WORKORDER_MANAGE });