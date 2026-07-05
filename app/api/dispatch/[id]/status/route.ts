// app/api/dispatch/[id]/status/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { dispatchController } from '@/modules/dispatch/controllers/dispatch.controller';
import { Permission } from '@/server/permissions/roles';

export const PUT = withAuth((req, ctx) => dispatchController.changeStatus(req, (ctx as any).params.id), { permission: Permission.DISPATCH_MANAGE });