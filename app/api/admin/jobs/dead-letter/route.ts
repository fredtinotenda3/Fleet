// app/api/admin/jobs/dead-letter/route.ts

import { NextRequest } from 'next/server';
import { jobSchedulerController } from '@/server/scheduler/job-scheduler.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => jobSchedulerController.listDeadLetters(req),
  { permission: Permission.JOB_VIEW }
);