// app/api/dispatch/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { dispatchController } from '@/modules/dispatch/controllers/dispatch.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req, ctx) => dispatchController.get(req, (ctx as any).params.id), { permission: Permission.DISPATCH_VIEW });