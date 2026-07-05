// app/api/workshop/bays/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workshopController } from '@/modules/workshop/controllers/workshop.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req, ctx) => workshopController.getBay(req, (ctx as any).params.id), { permission: Permission.WORKSHOP_VIEW });
export const PUT = withAuth((req, ctx) => workshopController.updateBay(req, (ctx as any).params.id), { permission: Permission.WORKSHOP_MANAGE });