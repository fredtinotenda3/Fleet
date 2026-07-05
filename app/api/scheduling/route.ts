// app/api/scheduling/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { schedulingController } from '@/modules/scheduling/controllers/scheduling.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => schedulingController.list(req), { permission: Permission.SCHEDULE_SHIFT_VIEW });
export const POST = withAuth((req) => schedulingController.create(req), { permission: Permission.SCHEDULE_SHIFT_MANAGE });