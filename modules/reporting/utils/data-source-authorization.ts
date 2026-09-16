// modules/reporting/utils/data-source-authorization.ts
//
// R.3.7 -- PREREQUISITE FIX for the Report Builder's pre-existing
// security gap (see the doc comment on DataSourceDefinition.
// requiredPermission for the full audit finding).
//
// Every data source is already gated at the ROUTE level by the blanket
// Permission.REPORT_VIEW/REPORT_CREATE (app/api/reports*, app/api/
// reporting/*). This helper adds the missing SECOND check: whether the
// caller may reach THIS PARTICULAR data source's underlying collection,
// per DataSourceDefinition.requiredPermission. Both checks are
// necessary -- REPORT_VIEW alone answers "can this user use the Report
// Builder at all," not "can this user read expense/fuel/allocation-
// ledger data through it."
//
// Deliberately a plain function, not a class/service: it has one job,
// no state, and no reason to be mocked as anything other than itself in
// tests (mirrors isForbiddenError's shape on the frontend).

import { AuthContext, hasPermission } from '@/server/auth/auth-context';
import { ForbiddenError } from '@/server/errors/app.errors';
import { dataSourceRegistry } from '../registry/DataSourceRegistry';
import type { DataSourceKey } from '../types/data-source.types';

/**
 * Throws ForbiddenError when `dataSourceKey` declares a
 * `requiredPermission` the caller does not hold.
 *
 * Silently allows when:
 *   - the source is unregistered (an "unknown data source" error is a
 *     validation concern for the caller to raise, not an authorization
 *     one -- surfacing it here would leak a misleading 403 for what is
 *     actually a 400/404), or
 *   - the source declares no `requiredPermission` at all (its exact
 *     pre-R.3.7 behaviour: gated only by the route-level REPORT_VIEW/
 *     REPORT_CREATE permission already enforced by withAuth()).
 *
 * `context.canBypassRbac` (SUPER_ADMIN / ORGANIZATION_OWNER) is honoured
 * automatically -- hasPermission() checks it before consulting the
 * permission list, exactly like every other permission check in this
 * codebase.
 */
export function assertDataSourceAccess(dataSourceKey: DataSourceKey, context: AuthContext): void {
  const source = dataSourceRegistry.get(dataSourceKey);
  if (!source || !source.requiredPermission) {
    return;
  }

  if (!hasPermission(context, source.requiredPermission)) {
    throw new ForbiddenError(
      `You do not have permission to access the "${source.label}" data source.`
    );
  }
}
