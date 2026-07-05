// app/api/security/audit-log/route.ts

import { NextRequest } from 'next/server';
import { auditLogController } from '@/modules/security/controllers/audit-log.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest, context) => auditLogController.list(req, context),
  { permission: Permission.AUDIT_LOG_VIEW }
);