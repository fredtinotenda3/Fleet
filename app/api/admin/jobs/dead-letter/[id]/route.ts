// app/api/admin/jobs/dead-letter/[id]/route.ts
//
// FIX (Phase D finalization): job-scheduler.controller.ts has exposed a
// working resolveDeadLetter(req, id) method since the dead-letter API
// was built, but no route ever called it -- GET .../dead-letter listed
// entries with no way to mark one resolved via the API. This wires that
// existing controller method up, following the exact same withAuth +
// dynamic-params pattern already used by
// app/api/admin/jobs/schedules/[id]/route.ts. No new logic is
// introduced here: resolveDeadLetter() already scopes the update to
// tenantId 'system' (the dead-letter queue is platform-shared
// infrastructure, consistent with listDeadLetters/retryJob above it),
// and JOB_MANAGE is now platform-admin-only (see server/permissions/
// roles.ts), so this cannot be reached by an organization owner/admin.

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