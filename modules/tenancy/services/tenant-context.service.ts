// modules/tenancy/services/tenant-context.service.ts

import { orgUnitRepository } from '@/modules/security/repositories/org-unit.repository';
import { userScopeAssignmentRepository } from '@/modules/security/repositories/user-scope-assignment.repository';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';
import { OrgUnit } from '@/modules/security/types/org-unit.types';
import { NotFoundError } from '@/server/errors/app.errors';

export interface TenantContext {
  organizationId: string;
  organizationName: string;
  /**
   * `null` means unrestricted (the user's role/assignments grant them
   * visibility across the whole organization, e.g. organization_owner
   * or fleet_manager with no narrower scope assignment). A non-null
   * array is the exact set of org unit ids (including descendants) the
   * user is allowed to see.
   */
  accessibleOrgUnitIds: string[] | null;
  /** The specific org unit currently "active" for this request, if any (x-org-unit-id header). */
  activeOrgUnitId?: string;
  activeOrgUnitPath?: string[];
}

const ORG_WIDE_ROLES = ['organization_owner', 'fleet_manager'];

export class TenantContextService {
  /**
   * Resolves the full multi-tenant context for a user within an
   * organization: which org units (branches/departments/teams/fleets/
   * workshops) they can see data for, given their organization-wide
   * role and any narrower UserScopeAssignment records (Phase 6).
   *
   * This is deliberately more permissive than the Permission Engine's
   * per-action `can()` check (Phase 6) â€” it answers "what should this
   * user's dashboards/lists be filtered to", not "is this specific
   * write allowed". The two are complementary: this narrows queries,
   * canPerform() still gates individual mutations.
   */
  async resolveContext(
    userId: string,
    tenantId: string,
    roles: string[],
    isSuperAdmin: boolean,
    activeOrgUnitId?: string
  ): Promise<TenantContext> {
    const organization = await organizationRepository.findById(tenantId, tenantId, false, true);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    let accessibleOrgUnitIds: string[] | null = null;

    if (!isSuperAdmin && !roles.some((r) => ORG_WIDE_ROLES.includes(r))) {
      const assignments = await userScopeAssignmentRepository.findByUser(userId, tenantId);
      const ids = new Set<string>();

      for (const assignment of assignments) {
        ids.add(assignment.orgUnitId);
        const descendants = await orgUnitRepository.getDescendantIds(assignment.orgUnitId, tenantId);
        descendants.forEach((id) => ids.add(id));
      }

      accessibleOrgUnitIds = Array.from(ids);
    }

    let activeOrgUnitPath: string[] | undefined;
    if (activeOrgUnitId) {
      const unit = await orgUnitRepository.findById(activeOrgUnitId, tenantId);
      if (unit) {
        activeOrgUnitPath = [...unit.path, unit._id!];
      }
    }

    return {
      organizationId: tenantId,
      organizationName: organization.name,
      accessibleOrgUnitIds,
      activeOrgUnitId,
      activeOrgUnitPath,
    };
  }

  async getHierarchyTree(organizationId: string): Promise<OrgUnit[]> {
    return orgUnitRepository.findByOrganization({ organizationId });
  }
}

export const tenantContextService = new TenantContextService();