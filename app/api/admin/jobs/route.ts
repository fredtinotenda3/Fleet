// app/api/admin/jobs/route.ts
//
// FIX (Phase D finalization): this index route was referenced in the
// project layout but never implemented, leaving GET /api/admin/jobs
// 404ing while its more specific siblings (/stats, /schedules,
// /dead-letter, /retry) all worked. It exposes the same queue-overview
// data as /api/admin/jobs/stats via the existing
// jobSchedulerController.getQueueStats() method -- no new aggregation
// logic is introduced -- so a client hitting the collection root gets
// a sensible response instead of a 404.

import { NextRequest } from 'next/server';
import { jobSchedulerController } from '@/server/scheduler/job-scheduler.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => jobSchedulerController.getQueueStats(req),
  { permission: Permission.JOB_VIEW }
);