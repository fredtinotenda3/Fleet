// app/api/workflows/process-timeouts/route.ts

/**
 * GET /api/workflows/process-timeouts
 *
 * Called by Vercel Cron (or any external scheduler). Delegates to
 * workflowEngine.processTimeouts(), which was implemented in Phase 4
 * but never had a caller â€” this closes that gap the same way
 * /api/reminders/notify-overdue wires up bulkUpdateOverdue.
 *
 * Runs once per tenant rather than a single 'system' pass, since
 * workflow instances are tenant-scoped (unlike reminders, which are
 * still pre-multi-tenancy). Add tenants to TENANT_IDS via env or a
 * lookup once Phase 7 (true multi-tenancy) lands; for now this also
 * accepts a single tenantId query param for manual/targeted runs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { workflowEngine } from '@/modules/workflows/services/workflow-engine.service';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';
import { denyCronRequest } from '@/server/middleware/cron-auth';


export async function GET(req: NextRequest) {
  // PHASE 0, F-1: fail-CLOSED. An absent CRON_SECRET now refuses
  // the request (500) instead of skipping authentication.
  const denied = denyCronRequest(req, '/api/workflows/process-timeouts');
  if (denied) return denied;

  try {
    const explicitTenantId = req.nextUrl.searchParams.get('tenantId');

    let tenantIds: string[];
    if (explicitTenantId) {
      tenantIds = [explicitTenantId];
    } else {
      // Derive the active tenant list from organizations rather than a
      // hardcoded array, so this scales as new orgs/tenants are created.
      const db = await (await import('@/infrastructure/database/mongodb')).default();
      const orgs = await db
        .collection('tblorganizations')
        .find({ isDeleted: { $ne: true }, status: 'active' })
        .project({ tenantId: 1 })
        .toArray();
      tenantIds = orgs.map((o) => o.tenantId).filter(Boolean);
    }

    let totalEscalated = 0;
    const perTenant: Record<string, number> = {};

    for (const tenantId of tenantIds) {
      try {
        const escalated = await workflowEngine.processTimeouts(tenantId);
        perTenant[tenantId] = escalated;
        totalEscalated += escalated;
      } catch (err) {
        console.error(`[process-timeouts] Failed for tenant ${tenantId}:`, err);
        perTenant[tenantId] = -1; // signal failure without aborting the rest
      }
    }

    console.log(
      `[process-timeouts] ${totalEscalated} step(s) escalated across ${tenantIds.length} tenant(s).`
    );

    return NextResponse.json({
      message:
        totalEscalated > 0
          ? `${totalEscalated} workflow step(s) escalated for timeout.`
          : 'No workflow steps timed out.',
      tenantsProcessed: tenantIds.length,
      totalEscalated,
      perTenant,
    });
  } catch (error) {
    console.error('[process-timeouts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process workflow timeouts' },
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
