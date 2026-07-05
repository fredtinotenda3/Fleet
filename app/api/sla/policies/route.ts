// app/api/sla/policies/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { slaController } from '@/modules/sla/controllers/sla.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => slaController.listPolicies(req), { permission: Permission.SLA_VIEW });
export const POST = withAuth((req) => slaController.createPolicy(req), { permission: Permission.SLA_MANAGE });