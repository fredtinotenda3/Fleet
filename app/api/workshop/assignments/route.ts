// app/api/workshop/assignments/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workshopController } from '@/modules/workshop/controllers/workshop.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req) => workshopController.assignMechanic(req), { permission: Permission.WORKSHOP_MANAGE });