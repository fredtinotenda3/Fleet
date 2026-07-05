// app/api/scheduling/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { schedulingController } from '@/modules/scheduling/controllers/scheduling.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req, ctx) => schedulingController.get(req, (ctx as any).params.id), { permission: Permission.SCHEDULE_SHIFT_VIEW });
export const PUT = withAuth((req, ctx) => schedulingController.update(req, (ctx as any).params.id), { permission: Permission.SCHEDULE_SHIFT_MANAGE });