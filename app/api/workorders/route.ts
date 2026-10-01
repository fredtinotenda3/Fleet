// app/api/workorders/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workOrderController } from '@/modules/workorders/controllers/workorder.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => workOrderController.list(req), { permission: Permission.WORKORDER_VIEW });
export const POST = withAuth((req) => workOrderController.create(req), { permission: Permission.WORKORDER_CREATE });