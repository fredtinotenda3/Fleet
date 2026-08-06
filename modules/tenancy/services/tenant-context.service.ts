// modules/tenancy/services/tenant-context.service.ts

import { orgUnitRepository } from '@/modules/security/repositories/org-unit.repository';
import { userScopeAssignmentRepository } from '@/modules/security/repositories/user-scope-assignment.repository';
import { OrgUnit } from '@/modules/security/types/org-unit.types';
import { NotFoundError, ForbiddenError } from '@/server/errors/app.errors';
import { Role, FULL_ORG_UNIT_VISIBILITY_ROLES } from '@/server/permissions/roles';
import { resolveTenantScope } from '@/server/tenancy/tenant-scope';
import { resolveOrganization } from '@/server/tenancy/organization-resolver';

export interface TenantContext {
  organizationId: string;
  organizationName: string;
  /**
   * `null` means unrestricted (the user's role grants them visibility
   * across the whole organization -- see FULL_ORG_UNIT_VISIBILITY_ROLES
   * in server/permissions/roles.ts). A non-null array is the exact set
   * of org unit ids (including descendants) the user is allowed to see.
   * An EMPTY array means "scoped, but to nothing" and fails closed.
   */
  accessibleOrgUnitIds: string[] | null;
  /** The specific org unit currently "active" for this request, if any (x-org-unit-id header). */
  activeOrgUnitId?: string;
  activeOrgUnitPath?: string[];
  /**
   * True when this context is the platform operator rather than a
   * member of any organization. Callers that must never run for a
   * customer (platform admin screens) branch on this instead of
   * re-deriving it from the tenantId string.
   */
  isPlatformScope: boolean;
  /**
   * The org units the user is DIRECTLY assigned to, excluding inherited
   * descendants. Used by the UI to render "you are viewing: Harare
   * Branch" and to seed the org-unit switcher, which should offer the
   * assignment roots rather than every descendant.
   */
  assignedOrgUnitIds: string[];
}

export class TenantContextService {
  /**
   * Resolves the full multi-tenant context for a user within an
   * organization: which org units (branches/departments/workshops/
   * fleets/teams) they can see data for, given their organization-wide
   * role and any narrower UserScopeAssignment records.
   *
   * This is deliberately more permissive than the Permission Engine's
   * per-action `can()` check -- it answers "what should this user's
   * dashboards/lists be filtered to", not "is this specific write
   * allowed". The two are complementary: this narrows queries,
   * canPerform() still gates individual mutations.
   */
  async resolveContext(
    userId: string,
    tenantId: string,
    roles: string[],
    isPlatformAdmin: boolean,
    activeOrgUnitId?: string
  ): Promise<TenantContext> {
    const isPlatformScope =
      resolveTenantScope(tenantId, { isPlatformAdmin }).kind === 'platform';

    if (isPlatformScope) {
      return {
        organizationId: tenantId,
        organizationName: 'Platform',
        accessibleOrgUnitIds: null,
        assignedOrgUnitIds: [],
        isPlatformScope: true,
        activeOrgUnitId,
      };
    }

    /**
     * FIX (critical -- this single line disabled the entire multi-tenancy
     * feature in production).
     *
     * Was:
     *   const organization = await organizationRepository
     *     .findById(tenantId, tenantId, false, true);
     *
     * `tenantId` in this system is the organization SLUG
     * ("willsgrove-farm-enterprises-9e80ed"), not its `_id`.
     * BaseRepository.findById() begins with
     * `if (!ObjectId.isValid(id)) return null;` -- and a slug is not 24
     * hex characters, so this returned null before issuing a query.
     * Every time. For every organization.
     *
     * The null then became `throw new NotFoundError('Organization not
     * found')`, and because resolveContext() is the gateway to every
     * org-unit-scoped read path, EVERY scoped endpoint 404'd for EVERY
     * non-platform user. A platform admin returns above without ever
     * reaching this lookup, which is precisely why the failure was
     * invisible from the super-admin account and why the dashboard
     * showed a mix of working widgets (bare-tenantId path) and
     * "Failed to load this widget" (resolveContext path).
     *
     * resolveOrganization() accepts the slug or an ObjectId and is the
     * one place that rule lives. See server/tenancy/organization-resolver.ts.
     */
    const organization = await resolveOrganization(tenantId);
    if (!organization) {
      throw new NotFoundError(
        `Organization not found for tenant "${tenantId}". The account is ` +
          'associated with an organization that no longer exists; run ' +
          '`npm run tenancy:report` to inspect.'
      );
    }

    if (organization.status === 'suspended' || organization.status === 'archived') {
      throw new ForbiddenError(
        `Organization "${organization.name}" is ${organization.status}.`
      );
    }

    const hasFullVisibility = roles.some((r) =>
      FULL_ORG_UNIT_VISIBILITY_ROLES.includes(r as Role)
    );

    let accessibleOrgUnitIds: string[] | null = null;
    let assignedOrgUnitIds: string[] = [];

    if (!hasFullVisibility) {
      const assignments = await userScopeAssignmentRepository.findByUser(userId, tenantId);
      assignedOrgUnitIds = assignments.map((a) => a.orgUnitId);

      /**
       * PERFORMANCE FIX: this used to call
       * `orgUnitRepository.getDescendantIds(assignment.orgUnitId, tenantId)`
       * inside a `for` loop over assignments -- one round trip per
       * assignment, sequentially, on EVERY authenticated request that
       * touches scoped data. A user assigned to five units cost five
       * serial queries before the actual page query even began.
       *
       * Descendant expansion is now a single query for the tenant's
       * units with the closure computed in memory. An organization's
       * unit count is bounded by its branch/department structure (tens,
       * not millions), so this is both fewer round trips and less total
       * work than the N-query version.
       */
      accessibleOrgUnitIds = await this.expandWithDescendants(
        assignedOrgUnitIds,
        tenantId
      );
    }

    /**
     * The `x-org-unit-id` header lets a user with broad access narrow
     * themselves to one unit (the org-unit switcher). It must only ever
     * NARROW: a user who supplies a unit outside their access is
     * refused rather than silently widened, otherwise the header is a
     * privilege-escalation vector on every endpoint.
     */
    let activeOrgUnitPath: string[] | undefined;
    let effectiveAccessible = accessibleOrgUnitIds;

    if (activeOrgUnitId) {
      const unit = await orgUnitRepository.findById(activeOrgUnitId, tenantId);
      if (!unit) {
        throw new NotFoundError(`Org unit "${activeOrgUnitId}" not found.`);
      }

      if (accessibleOrgUnitIds !== null && !accessibleOrgUnitIds.includes(activeOrgUnitId)) {
        throw new ForbiddenError(
          'The requested org unit is outside your assigned scope.'
        );
      }

      activeOrgUnitPath = [...unit.path, unit._id!];

      // Narrow to the active unit and everything beneath it.
      const subtree = await this.expandWithDescendants([activeOrgUnitId], tenantId);
      effectiveAccessible =
        accessibleOrgUnitIds === null
          ? subtree
          : subtree.filter((id) => accessibleOrgUnitIds.includes(id));
    }

    return {
      organizationId: tenantId,
      organizationName: organization.name,
      accessibleOrgUnitIds: effectiveAccessible,
      assignedOrgUnitIds,
      isPlatformScope: false,
      activeOrgUnitId,
      activeOrgUnitPath,
    };
  }

  /**
   * Expands a set of org unit ids to include every descendant, using a
   * single read of the tenant's units.
   *
   * Returns the roots themselves even when a root has no descendants,
   * and de-duplicates overlapping subtrees (a user assigned to both a
   * branch and a department inside it).
   */
  private async expandWithDescendants(
    rootIds: string[],
    tenantId: string
  ): Promise<string[]> {
    if (rootIds.length === 0) return [];

    const units = await orgUnitRepository.findByOrganization({
      organizationId: tenantId,
    });

    const roots = new Set(rootIds);
    const result = new Set(rootIds);

    for (const unit of units) {
      const id = unit._id;
      if (!id) continue;
      // `path` is the materialized ancestor chain, so a unit is a
      // descendant of any root that appears in it.
      if (unit.path?.some((ancestorId) => roots.has(ancestorId))) {
        result.add(id);
      }
    }

    return Array.from(result);
  }

  async getHierarchyTree(organizationId: string): Promise<OrgUnit[]> {
    return orgUnitRepository.findByOrganization({ organizationId });
  }
}

export const tenantContextService = new TenantContextService();
