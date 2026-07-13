// app/api/expenses/[id]/route.ts

import { expenseController } from '@/modules/expenses/controllers/expense.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

/**
 * FIX (critical -- permission bypass + missing tenant scoping): this
 * route used to be a hand-rolled handler that called only requireAuth()
 * (proves a session exists, checks NOTHING about permission) and wrote
 * directly to MongoDB, bypassing expenseCommandService entirely. Two
 * distinct critical bugs from that:
 *
 *   1. Permission bypass -- app/api/expenses/route.ts's DELETE (same
 *      logical operation, reached via `?id=` instead of a path segment)
 *      correctly requires Permission.EXPENSE_DELETE via withAuth. This
 *      route accepted the identical DELETE operation with NO permission
 *      check at all -- any authenticated user of any role (viewer,
 *      driver, anyone) could soft-delete any expense in their tenant by
 *      hitting this path instead of the query-param one.
 *   2. Bypassed the command service -- writing `$set: {isDeleted:true}`
 *      directly meant deletes through this path never published
 *      ExpenseDeletedEvent, never invalidated the analytics query
 *      cache (see AnalyticsHandler), and never appeared in the audit
 *      log, silently diverging from every other delete in the app.
 *
 * Now a thin withAuth-wrapped delegate to the same expenseController
 * used by app/api/expenses/route.ts, so both paths to "delete this
 * expense" go through identical permission checks, tenant scoping, and
 * event publication. The tenant-scoping fix that was already here is
 * preserved -- it now happens inside expenseCommandService instead of
 * ad-hoc in this file.
 */
interface RouteParams {
  params: Promise<{ id: string }>;
}

export const DELETE = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return expenseController.deleteExpense(req, id);
  },
  { permission: Permission.EXPENSE_DELETE }
);