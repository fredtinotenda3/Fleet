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

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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