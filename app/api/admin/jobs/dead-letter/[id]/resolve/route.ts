// app/api/admin/jobs/dead-letter/[id]/resolve/route.ts

import { NextRequest } from 'next/server';
import { jobSchedulerController } from '@/server/scheduler/job-scheduler.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return jobSchedulerController.resolveDeadLetter(req, id);
  },
  { permission: Permission.JOB_MANAGE }
);