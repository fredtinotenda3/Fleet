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

    // DEFENSE IN DEPTH: normalize to strings here too, not just at the
    // one call site (TenantContextService.expandWithDescendants) known
    // to have leaked raw ObjectIds into this array. orgUnitId is stored
    // as a string on every domain document; a stray ObjectId in this
    // $in never matches, which is precisely how scoped users ended up
    // seeing zero rows despite correct assignments. This filter is the
    // last place that runs before the query goes out, so it's the
    // right place to guarantee the invariant rather than trust every
    // caller to have upheld it.
    const accessibleIds = context.accessibleOrgUnitIds.map((id) => String(id));

    return { [orgUnitField]: { $in: accessibleIds } } as unknown as Filter<T>;
  }

  canAccessOrgUnit(context: TenantContext, orgUnitId: string): boolean {
    if (context.accessibleOrgUnitIds === null) return true;
    return context.accessibleOrgUnitIds.includes(orgUnitId);
  }
}

export const tenantScopeService = new TenantScopeService();