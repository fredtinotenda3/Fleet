// frontend/modules/workorders/services/mechanics.api.ts
//
// There is no dedicated "list mechanics" backend endpoint. Mechanics
// (and Workshop Managers, who can also be assigned as the responsible
// person on a work order) are just organization members with an
// assignable role, and the roster is already returned embedded on
// GET /api/organizations/[id] (see organization.service.ts's
// getOrganization -> `organization.members`). Reusing organizationApi
// here instead of hand-rolling a second fetch of the same endpoint.

import { organizationApi } from '@/frontend/modules/organizations';
import type { OrganizationMember } from '@/frontend/modules/organizations';

export const mechanicsApi = {
  /** tenantId is the org slug (see docs/TENANCY.md) -- same id AuthUser.tenantId already holds. */
  async listOrganizationMembers(tenantId: string): Promise<OrganizationMember[]> {
    const organization = await organizationApi.getOrganization(tenantId);
    return organization.members ?? [];
  },
};

export default mechanicsApi;