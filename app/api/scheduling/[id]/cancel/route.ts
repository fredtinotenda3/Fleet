// app/api/scheduling/[id]/cancel/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { schedulingController } from '@/modules/scheduling/controllers/scheduling.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => schedulingController.cancel(req, (ctx as any).params.id), { permission: Permission.SCHEDULE_SHIFT_MANAGE });