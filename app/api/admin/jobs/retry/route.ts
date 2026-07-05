// app/api/admin/jobs/retry/route.ts

import { NextRequest } from 'next/server';
import { jobSchedulerController } from '@/server/scheduler/job-scheduler.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  (req: NextRequest) => jobSchedulerController.retryJob(req),
  { permission: Permission.JOB_MANAGE }
);