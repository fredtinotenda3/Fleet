// frontend/modules/platform-admin/services/platform-admin.api.ts
//
// Every call here maps to a route that already exists. No endpoint is
// invented, and no response is reshaped -- `apiClient` unwraps the
// `{ success, data }` envelope and surfaces `{ data, pagination }` for
// paginated routes, so what these functions return is exactly the
// backend's `data` payload.

import { apiClient } from '@/shared/utils/api-client.utils';
import type {
  CreateOrgUnitPayload,
  CreateOrganizationPayload,
  OrgUnitSummary,
  PlatformOrganization,
  PlatformOrganizationListParams,
  PlatformOrganizationListResult,
  PlatformStats,
  SetOrganizationStatusPayload,
} from '../types';

const PLATFORM_BASE = '/api/platform';
const ORGANIZATIONS_BASE = '/api/organizations';

/**
 * Org units are read and written through the TENANCY route, not
 * `/api/security/org-units`.
 *
 * Both exist and both now run hierarchy validation, but
 * app/api/tenancy/org-units/route.ts is the one whose POST goes through
 * `TenancyController.createOrgUnit`, and its own header names it as the
 * path "the app's own UI uses". frontend/modules/organizations already
 * targets it. Adding a second base path for the same collection is how
 * two screens end up disagreeing about validation.
 */
const ORG_UNITS_BASE = '/api/tenancy/org-units';

export const platformAdminApi = {
  /**
   * GET /api/platform/organizations
   *
   * Cross-tenant. Gated on Permission.PLATFORM_VIEW *and* an
   * in-controller check for the literal Role.SUPER_ADMIN, so an
   * organization_owner gets a 403 here even though they hold every
   * static permission. The page-level check in OrganizationsPage
   * mirrors that so such a caller sees a clear message instead of a
   * failed fetch -- it is not the enforcement point.
   */
  async listOrganizations(
    params?: PlatformOrganizationListParams
  ): Promise<PlatformOrganizationListResult> {
    return apiClient.get<PlatformOrganizationListResult>(`${PLATFORM_BASE}/organizations`, {
      params: {
        page: params?.page,
        limit: params?.limit,
        status: params?.status,
        tier: params?.tier,
        search: params?.search,
      },
    });
  },

  /** GET /api/platform/organizations/:id. Accepts a slug or an ObjectId (`resolveOrganization`). */
  async getOrganization(id: string): Promise<PlatformOrganization> {
    return apiClient.get<PlatformOrganization>(
      `${PLATFORM_BASE}/organizations/${encodeURIComponent(id)}`
    );
  },

  /** GET /api/platform/stats. Three counters, nothing more. */
  async getStats(): Promise<PlatformStats> {
    return apiClient.get<PlatformStats>(`${PLATFORM_BASE}/stats`);
  },

  /**
   * PUT /api/platform/organizations/:id/status
   *
   * Gated on Permission.PLATFORM_MANAGE (a stricter gate than the reads
   * above) and audited server-side with the supplied `reason`.
   */
  async setOrganizationStatus(
    id: string,
    payload: SetOrganizationStatusPayload
  ): Promise<PlatformOrganization> {
    return apiClient.put<PlatformOrganization>(
      `${PLATFORM_BASE}/organizations/${encodeURIComponent(id)}/status`,
      payload
    );
  },

  /**
   * POST /api/organizations
   *
   * The ONLY organization-creation endpoint that exists. It is
   * self-service (`withAuth` with no permission), and the controller
   * sets `ownerId` from the CALLER -- so the admin who submits this
   * becomes the new organization's owner. There is no platform-level
   * "create an organization owned by someone else" route; see
   * PLATFORM_ADMIN_NOTES.md.
   */
  async createOrganization(payload: CreateOrganizationPayload): Promise<PlatformOrganization> {
    return apiClient.post<PlatformOrganization>(ORGANIZATIONS_BASE, payload);
  },

  /**
   * GET /api/tenancy/org-units
   *
   * TENANT-SCOPED TO THE CALLER. `OrgUnitController.listOrgUnits`
   * resolves `organizationId` from the session, so this can only ever
   * describe the caller's own organization no matter what is passed.
   * Callers must gate on `canManageOrgUnitsFor` before rendering the
   * result against some other organization's page.
   */
  async listOrgUnits(params?: { type?: string; parentId?: string | null }): Promise<OrgUnitSummary[]> {
    return apiClient.get<OrgUnitSummary[]>(ORG_UNITS_BASE, {
      params: {
        type: params?.type,
        // The controller reads the literal string 'null' as "top level
        // only"; an actual null would serialise to the string "null"
        // anyway, so this is stated rather than left to coincidence.
        parentId: params?.parentId === null ? 'null' : params?.parentId,
      },
    });
  },

  /**
   * POST /api/tenancy/org-units
   *
   * TENANT-SCOPED TO THE CALLER, and emphatically so: the controller
   * builds `{ ...parsed.data, organizationId: tenantId }`, spreading the
   * session's tenant LAST. A body naming another organization is
   * overridden silently, which is exactly why this module refuses to
   * offer the form unless the viewed organization is the caller's own.
   */
  async createOrgUnit(payload: CreateOrgUnitPayload): Promise<OrgUnitSummary> {
    return apiClient.post<OrgUnitSummary>(ORG_UNITS_BASE, payload);
  },
};
