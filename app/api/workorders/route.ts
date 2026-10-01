// app/api/workorders/stats/route.ts
//
// R.3.6 -- Work Order Reporting. Same permission (WORKORDER_VIEW) as
// GET /api/workorders and GET /api/workorders/[id] -- an aggregate view
// over work orders is not a lower-sensitivity read than the row list,
// so it is not gated any more loosely. Tenant + org-unit scope is
// resolved and enforced identically (see WorkOrderController.stats ->
// WorkOrderService.getStats -> WorkOrderRepository.getStatsInScope,
// which reuses the same buildScopedQuery as the list/export paths).
import { withAuth } from '@/server/middleware/with-auth';
import { workOrderController } from '@/modules/workorders/controllers/workorder.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => workOrderController.stats(req), { permission: Permission.WORKORDER_VIEW });
