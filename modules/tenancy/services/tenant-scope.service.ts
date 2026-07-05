// modules/tenancy/services/tenant-scope.service.ts

import { Filter } from 'mongodb';
import { TenantContext } from './tenant-context.service';

/**
 * Turns a resolved TenantContext into a MongoDB filter fragment that
 * repositories can spread into their query, restricting results to the
 * org units (branch/department/team/fleet/workshop) the caller may see.
 *
 * Usage in a domain repository (see
 * modules/vehicles/types/vehicle.tenancy-addendum.ts for the reference
 * integration):
 *
 *   const scopeFilter = tenantScopeService.buildFilter(context, 'orgUnitId');
 *   const filter = { ...baseFilter, ...scopeFilter };
 */
export class TenantScopeService {
  buildFilter<T>(context: TenantContext, orgUnitField: keyof T & string): Filter<T> {
    if (context.accessibleOrgUnitIds === null) {
      return {} as Filter<T>;
    }

    if (context.accessibleOrgUnitIds.length === 0) {
      // The user has scope assignments but they resolved to nothing
      // (e.g. assigned org units were deleted) â€” fail closed rather
      // than accidentally returning organization-wide data.
      return { [orgUnitField]: { $in: [] } } as unknown as Filter<T>;
    }

    return { [orgUnitField]: { $in: context.accessibleOrgUnitIds } } as unknown as Filter<T>;
  }

  canAccessOrgUnit(context: TenantContext, orgUnitId: string): boolean {
    if (context.accessibleOrgUnitIds === null) return true;
    return context.accessibleOrgUnitIds.includes(orgUnitId);
  }
}

export const tenantScopeService = new TenantScopeService();