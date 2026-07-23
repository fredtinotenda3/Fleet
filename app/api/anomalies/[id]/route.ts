// app/api/anomalies/[id]/route.ts

import { NextRequest } from 'next/server';
import { anomalyController } from '@/modules/intelligence/controllers/anomaly.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { AuthContext } from '@/server/auth/auth-context';

export const GET = withAuth(
  (req: NextRequest, context: AuthContext, { params }: { params: { id: string } }) => 
    anomalyController.getById(req, params.id),
  { permission: Permission.ANALYTICS_VIEW }
);

export const PATCH = withAuth(
  (req: NextRequest, context: AuthContext, { params }: { params: { id: string } }) => 
    anomalyController.updateStatus(req, params.id),
  { permission: Permission.ANALYTICS_VIEW }
);