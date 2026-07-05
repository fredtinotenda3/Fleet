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

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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