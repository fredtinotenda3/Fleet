// app/api/reminders/notify-overdue/route.ts

/**
 * GET /api/reminders/notify-overdue
 *
 * Called by Vercel Cron. Delegates entirely to
 * maintenanceCommandService.bulkUpdateOverdue, which now also handles
 * notifying each reminder's assignee — this route no longer needs its
 * own marking/email logic, and can't drift out of sync with
 * /api/reminders/update-status the way the two separate implementations
 * could before.
 */
import { NextResponse } from 'next/server';
import { maintenanceCommandService } from '@/modules/maintenance/services/maintenance-command.service';
import { denyCronRequest } from '@/server/middleware/cron-auth';


export async function GET(req: Request) {
  // PHASE 0, F-1: fail-CLOSED. An absent CRON_SECRET now refuses
  // the request (500) instead of skipping authentication.
  const denied = denyCronRequest(req, '/api/reminders/notify-overdue');
  if (denied) return denied;

  try {
    const result = await maintenanceCommandService.bulkUpdateOverdue('system');

    console.log(
      `[notify-overdue] ${result.newlyOverdueCount} reminder(s) newly marked overdue (${result.updatedCount} total status changes).`
    );

    return NextResponse.json({
      message:
        result.newlyOverdueCount > 0
          ? `${result.newlyOverdueCount} reminder(s) marked overdue.`
          : 'No newly overdue reminders.',
      updatedCount: result.updatedCount,
      newlyOverdueCount: result.newlyOverdueCount,
    });
  } catch (error) {
    console.error('[notify-overdue] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process overdue reminders' },
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
