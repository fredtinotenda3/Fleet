// app/api/esg/export/route.ts

import { NextRequest } from 'next/server';
import { esgController } from '@/modules/esg/controllers/esg.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => esgController.exportData(req),
  { permission: Permission.ANALYTICS_EXPORT }
);
