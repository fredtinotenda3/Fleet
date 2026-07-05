// app/api/workshop/bays/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { workshopController } from '@/modules/workshop/controllers/workshop.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => workshopController.listBays(req), { permission: Permission.WORKSHOP_VIEW });
export const POST = withAuth((req) => workshopController.createBay(req), { permission: Permission.WORKSHOP_MANAGE });