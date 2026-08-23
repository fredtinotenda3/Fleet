// app/api/security/expire-grants/route.ts

/**
 * GET /api/security/expire-grants
 *
 * Called by a scheduled job (Vercel Cron or equivalent). Soft-deletes
 * every ResourcePermission grant whose `expiresAt` has passed and
 * invalidates the permission cache so the expiry takes effect
 * immediately rather than waiting out the cache TTL. Mirrors the
 * pattern used by /api/reminders/notify-overdue and
 * /api/workflows/process-timeouts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resourcePermissionRepository } from '@/modules/security/repositories/resource-permission.repository';
import { permissionCacheService } from '@/modules/security/services/permission-cache.service';
import { denyCronRequest } from '@/server/middleware/cron-auth';


export async function GET(req: NextRequest) {
  // PHASE 0, F-1: fail-CLOSED. An absent CRON_SECRET now refuses
  // the request (500) instead of skipping authentication.
  const denied = denyCronRequest(req, '/api/security/expire-grants');
  if (denied) return denied;

  try {
    const expiredCount = await resourcePermissionRepository.expireStaleGrants();

    if (expiredCount > 0) {
      await permissionCacheService.invalidateAll();
    }

    return NextResponse.json({
      message:
        expiredCount > 0
          ? `${expiredCount} expired grant(s) revoked.`
          : 'No expired grants found.',
      expiredCount,
    });
  } catch (error) {
    console.error('[expire-grants] Error:', error);
    return NextResponse.json(
      { error: 'Failed to expire stale resource permission grants' },
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
