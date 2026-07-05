// app/api/dispatch/[id]/assign/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { dispatchController } from '@/modules/dispatch/controllers/dispatch.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => dispatchController.assign(req, (ctx as any).params.id), { permission: Permission.DISPATCH_ASSIGN });