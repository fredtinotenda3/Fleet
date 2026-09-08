// app/api/telematics/alerts/summary/route.ts
//
// Aggregated unacknowledged telematics alerts for the caller's scope:
// totals, a breakdown by type and by severity, and the worst vehicles.
//
// TENANT- AND ORG-UNIT SCOPED. The controller resolves a full
// TenantContext rather than a bare tenantId, and the repository spreads
// the org-unit predicate LAST so nothing can override the scope key.
// That is not incidental care -- a summary endpoint is exactly where a
// leak reappears after the row-level list has been fixed, which has
// already happened twice here (the anomaly severity counts, and the
// report engine's $match).
//
// Gated on VEHICLE_VIEW, matching the per-vehicle alert route it
// aggregates: a summary must never be readable by someone who cannot
// read the rows it counts.

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => telematicsController.getAlertSummary(req),
  { permission: Permission.VEHICLE_VIEW }
);
