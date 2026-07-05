// app/api/workorders/[id]/labor/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workOrderController } from '@/modules/workorders/controllers/workorder.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => workOrderController.recordLabor(req, (ctx as any).params.id), { permission: Permission.WORKORDER_MANAGE });