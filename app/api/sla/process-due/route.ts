// app/api/sla/process-due/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { slaController } from '@/modules/sla/controllers/sla.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req) => slaController.processDue(req), { permission: Permission.SLA_MANAGE });