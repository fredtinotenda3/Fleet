// app/api/security/audit-log/verify/route.ts

import { NextRequest } from 'next/server';
import { auditLogController } from '@/modules/security/controllers/audit-log.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => auditLogController.verify(req),
  { permission: Permission.AUDIT_LOG_VERIFY }
);