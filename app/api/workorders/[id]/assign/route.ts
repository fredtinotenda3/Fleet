// app/api/workorders/[id]/assign/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workOrderController } from '@/modules/workorders/controllers/workorder.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => workOrderController.assign(req, (ctx as any).params.id), { permission: Permission.WORKORDER_ASSIGN });