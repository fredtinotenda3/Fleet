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

  /**
   * Whether a caller may read/modify a SINGLE record that carries
   * `orgUnitId` (or does not carry one at all).
   *
   * ---------------------------------------------------------------
   * THE FAIL-OPEN THIS REPLACES
   * ---------------------------------------------------------------
   * Five controllers each wrote the by-id check inline as:
   *
   *     if (row.orgUnitId && !canAccessOrgUnit(ctx, row.orgUnitId))
   *       throw new NotFoundError(...)
   *
   * The leading truthiness test is the defect. A record with NO
   * orgUnitId skipped the check entirely, so it was readable,
   * UPDATABLE and DELETABLE by any authenticated user holding the
   * permission -- while `buildFilter` hid that same record from the
   * list. The two rules disagreed, and the by-id one was the
   * permissive half.
   *
   * That is worse than it first sounds. The rows most likely to lack
   * an orgUnitId are precisely the ones written before org-unit
   * scoping existed, and a narrowed user could not see them to know
   * they were there -- but could reach every one of them by walking
   * ids.
   *
   * This mirrors `buildFilter` exactly, which is the point: what a
   * caller can reach by id is now the same set they can reach by
   * listing, by construction rather than by two implementations
   * agreeing.
   *
   *   - accessibleOrgUnitIds === null (org-wide role, platform scope):
   *     everything in-tenant, including rows with no unit. `$in` is
   *     never applied for these callers either.
   *   - narrowed: the row must CARRY a unit and it must be accessible.
   *     `{orgUnitId: {$in: [...]}}` does not match a missing field, so
   *     an unassigned row is invisible to a list -- and must therefore
   *     be unreachable by id.
   *
   * DEPLOYMENT NOTE. On a database that predates org-unit scoping this
   * hides legacy rows from narrowed users until
   * `npm run tenancy:backfill` has run. That is the correct order and
   * it is why this was deferred a round: tightening first would have
   * been an outage. A freshly reset database writes orgUnitId on every
   * record, so there is nothing to backfill.
   */
  canAccessRecord(context: TenantContext, orgUnitId: string | null | undefined): boolean {
    if (context.accessibleOrgUnitIds === null) return true;
    if (!orgUnitId) return false;
    return this.canAccessOrgUnit(context, orgUnitId);
  }
}

export const tenantScopeService = new TenantScopeService();