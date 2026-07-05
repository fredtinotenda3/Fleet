// app/api/admin/jobs/schedules/route.ts

import { NextRequest } from 'next/server';
import { jobSchedulerController } from '@/server/scheduler/job-scheduler.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => jobSchedulerController.listSchedules(req),
  { permission: Permission.JOB_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => jobSchedulerController.createSchedule(req),
  { permission: Permission.SCHEDULE_MANAGE }
);