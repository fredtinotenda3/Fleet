// app/api/observability/telematics/providers/route.ts
//
// PHASE 7 -- "which provider is failing, and for how long?"
//
// Gated on Permission.PLATFORM_VIEW, which is a PLATFORM-ONLY permission
// (see PLATFORM_ONLY_PERMISSIONS in roles.ts): it is filtered out of
// every tenant-level role, so no organization owner or admin can reach
// this however many roles they hold. That is the correct gate because
// the response is cross-tenant by construction.
//
// WHAT THE RESPONSE DELIBERATELY DOES NOT CONTAIN:
//
//   * tenant ids, names or any tenant identifier -- only COUNTS. An
//     operator diagnosing a vendor outage needs to know how widespread
//     it is, not which customers to name in a dashboard that may be
//     screenshared.
//   * credentials of any kind. There is no code path from the health
//     service to a decrypted token.
//   * vendor error messages or payloads. Errors surface as the Phase 2
//     NEUTRAL CATEGORY, which tells an operator what to do (rotate
//     credentials vs wait vs escalate) rather than sending them to read
//     vendor documentation.
//
// Note that middleware.ts does not cover non-versioned /api/*, so the
// withAuth wrapper below is the only protection on this path.
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { providerHealthService } from '@/modules/telematics/services/provider-health.service';

export const GET = withAuth(
  async () => {
    const providers = await providerHealthService.getAll();
    const aggregate = await providerHealthService.aggregateStatus();

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      aggregate,
      providers,
    });
  },
  { permission: Permission.PLATFORM_VIEW }
);
