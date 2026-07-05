// app/api/dispatch/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { dispatchController } from '@/modules/dispatch/controllers/dispatch.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => dispatchController.list(req), { permission: Permission.DISPATCH_VIEW });
export const POST = withAuth((req) => dispatchController.create(req), { permission: Permission.DISPATCH_CREATE });