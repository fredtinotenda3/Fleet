// app/api/procurement/requests/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { procurementController } from '@/modules/procurement/controllers/procurement.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => procurementController.listRequests(req), { permission: Permission.PROCUREMENT_VIEW });
export const POST = withAuth((req) => procurementController.createRequest(req), { permission: Permission.PROCUREMENT_REQUEST });