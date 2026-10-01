// app/api/reminders/update-status/route.ts

/**
 * GET /api/reminders/update-status
 *
 * Now backed by the same BulkUpdateOverdueCommand as notify-overdue.
 * Also added the CRON_SECRET check — this endpoint previously had NO
 * authentication at all despite recalculating status across every
 * reminder in the system, which is worth closing while touching this file.
 */
import { NextRequest, NextResponse } from 'next/server';
import { maintenanceCommandService } from '@/modules/maintenance/services/maintenance-command.service';
import { denyCronRequest } from '@/server/middleware/cron-auth';


export async function GET(req: NextRequest) {
  // PHASE 0, F-1: fail-CLOSED. An absent CRON_SECRET now refuses
  // the request (500) instead of skipping authentication.
  const denied = denyCronRequest(req, '/api/reminders/update-status');
  if (denied) return denied;

  try {
    const result = await maintenanceCommandService.bulkUpdateOverdue('system');

    return NextResponse.json({
      message: 'Reminder statuses updated successfully.',
      updatedCount: result.updatedCount,
    });
  } catch (error) {
    console.error('Error updating reminder statuses:', error);
    return NextResponse.json(
      { error: 'Failed to update reminder statuses' },
      { status: 500 }
    );
  }
}

/**
 * PHASE 0, F-1 -- HTTP METHOD DECISION.
 *
 * This operation mutates state, so POST is the semantically correct
 * method. GET is RETAINED as the primary entry point because Vercel Cron
 * (see vercel.json) issues GET and cannot be configured to issue POST --
 * removing the GET handler would silently stop the schedule.
 *
 * Retaining a mutating GET is safe here specifically because the
 * credential is a Bearer header, which a browser never attaches
 * automatically: there is no ambient-authority (CSRF) path to this
 * route, unlike a cookie-authenticated one. The fail-closed guard above
 * applies identically to both methods.
 *
 * POST is exported so operators running a scheduler that CAN issue it
 * (GitHub Actions, Cloud Scheduler, k8s CronJob, curl) can use the
 * correct method today, and so GET can be retired without a code change
 * once Vercel Cron is no longer the driver.
 */
export const POST = GET;
