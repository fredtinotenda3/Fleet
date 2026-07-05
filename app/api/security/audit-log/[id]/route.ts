// app/api/security/audit-log/[id]/route.ts

import { NextRequest } from 'next/server';
import { auditLogController } from '@/modules/security/controllers/audit-log.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, context, { params }) => {
    const { id } = await params;
    return auditLogController.get(req, context, id);
  },
  { permission: Permission.AUDIT_LOG_VIEW }
);