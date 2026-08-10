// app/api/dvir/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { dvirController } from '@/modules/dvir/controllers/dvir.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => dvirController.list(req), { permission: Permission.DVIR_VIEW });
export const POST = withAuth((req) => dvirController.submit(req), { permission: Permission.DVIR_CREATE });
