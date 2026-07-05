// app/api/workshop/assignments/[id]/release/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workshopController } from '@/modules/workshop/controllers/workshop.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => workshopController.releaseMechanic(req, (ctx as any).params.id), { permission: Permission.WORKSHOP_MANAGE });