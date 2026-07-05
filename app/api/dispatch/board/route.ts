// app/api/dispatch/board/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { dispatchController } from '@/modules/dispatch/controllers/dispatch.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => dispatchController.board(req), { permission: Permission.DISPATCH_VIEW });