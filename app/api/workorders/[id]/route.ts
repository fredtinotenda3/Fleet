// app/api/workorders/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workOrderController } from '@/modules/workorders/controllers/workorder.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req, ctx) => workOrderController.get(req, (ctx as any).params.id), { permission: Permission.WORKORDER_VIEW });