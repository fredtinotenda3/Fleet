// frontend/modules/organizations/services/organization.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type {
  Organization,
  OrganizationInvite,
  CreateOrganizationPayload,
  UpdateOrganizationPayload,
  InviteMemberPayload,
  UpdateMemberRolePayload,
  AcceptInvitePayload,
  OrgUnitNode,
  CreateOrgUnitPayload,
  UpdateOrgUnitPayload,
  MoveOrgUnitPayload,
} from '../types';
import { BrandingFormValues, ContactDetailsFormValues, RegionalSettingsFormValues, BusinessHoursFormValues, TaxSettingsFormValues } from '../schemas';

// FIXED: BASE paths remain the same - they start with /api/ which is correct
// The apiClient no longer adds an extra /api prefix
const BASE = '/api/organizations';
const ORG_UNITS_BASE = '/api/tenancy/org-units';

export const organizationApi = {
  /**
   * Organizations the current user belongs to (owner or member).
   * Backing route: GET /api/organizations
   */
  async getMyOrganizations(): Promise<Organization[]> {
    return apiClient.get<Organization[]>(BASE);
  },

  /**
   * Backing route: GET /api/organizations/[id]
   */
  async getOrganization(id: string): Promise<Organization> {
    return apiClient.get<Organization>(`${BASE}/${id}`);
  },

  /**
   * Backing route: POST /api/organizations
   */
  async createOrganization(payload: CreateOrganizationPayload): Promise<Organization> {
    return apiClient.post<Organization>(BASE, payload);
  },

  /**
   * Backing route: PATCH /api/organizations/[id]
   */
  async updateOrganization(id: string, payload: UpdateOrganizationPayload): Promise<Organization> {
    return apiClient.patch<Organization>(`${BASE}/${id}`, payload);
  },

  updateGeneralInfo: (id: string, data: { name: string; companyName: string }) =>
    apiClient.patch(`${BASE}/${id}`, { name: data.name, branding: { companyName: data.companyName } }),

  updateBranding: (id: string, data: BrandingFormValues) =>
    apiClient.patch(`${BASE}/${id}`, { branding: data }),

  uploadLogo: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    return apiClient.post(`${BASE}/${id}/logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  updateContactDetails: (id: string, data: ContactDetailsFormValues) =>
    apiClient.patch(`${BASE}/${id}/contact`, data),

  updateRegionalSettings: (id: string, data: RegionalSettingsFormValues) =>
    apiClient.patch(`${BASE}/${id}`, { settings: data }),

  updateBusinessHours: (id: string, data: BusinessHoursFormValues) =>
    apiClient.patch(`${BASE}/${id}/business-hours`, data),

  updateTaxSettings: (id: string, data: TaxSettingsFormValues) =>
    apiClient.patch(`${BASE}/${id}/tax-settings`, data),

  /**
   * Backing route: POST /api/organizations/[id]/members/invite
   */
  async inviteMember(id: string, payload: InviteMemberPayload): Promise<OrganizationInvite> {
    return apiClient.post<OrganizationInvite>(`${BASE}/${id}/members/invite`, payload);
  },

  /**
   * Backing route: POST /api/organizations/[id]/invites/[token]/resend
   */
  async resendInvite(id: string, token: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(
      `${BASE}/${id}/invites/${encodeURIComponent(token)}/resend`,
      {}
    );
  },

  /**
   * Backing route: POST /api/organizations/invites/decline
   */
  async declineInvite(token: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(`${BASE}/invites/decline`, { token });
  },

  /**
   * Backing route: DELETE /api/organizations/[id]/members/invite?token=...
   */
  async revokeInvite(id: string, token: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(
      `${BASE}/${id}/members/invite?token=${encodeURIComponent(token)}`
    );
  },

  /**
   * Backing route: POST /api/organizations/invites/accept
   */
  async acceptInvite(payload: AcceptInvitePayload): Promise<Organization> {
    return apiClient.post<Organization>(`${BASE}/invites/accept`, payload);
  },

  /**
   * Backing route: DELETE /api/organizations/[id]/members/[memberId]
   */
  async removeMember(id: string, memberId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${BASE}/${id}/members/${memberId}`);
  },

  /**
   * Backing route: PATCH /api/organizations/[id]/members/[memberId]
   */
  async updateMemberRole(
    id: string,
    { memberId, role }: UpdateMemberRolePayload
  ): Promise<{ message: string }> {
    return apiClient.patch<{ message: string }>(`${BASE}/${id}/members/${memberId}`, { role });
  },

  /**
   * Suspend an active member. Backing route: POST /api/organizations/[id]/members/[memberId]/suspend
   */
  async suspendMember(id: string, memberId: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(`${BASE}/${id}/members/${memberId}/suspend`, {});
  },

  /**
   * Restore a suspended member. Backing route: POST /api/organizations/[id]/members/[memberId]/restore
   */
  async restoreMember(id: string, memberId: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(`${BASE}/${id}/members/${memberId}/restore`, {});
  },

  /**
   * Backing route: GET /api/organizations/[id]/statistics
   */
  async getStatistics(id: string) {
    return apiClient.get(`${BASE}/${id}/statistics`);
  },

  /**
   * Backing route: GET /api/security/audit-log?entityType=organization&entityId=...
   */
  async getAuditLog(id: string, page = 1, limit = 20) {
    return apiClient.get(
      `/api/security/audit-log?entityType=organization&entityId=${id}&page=${page}&limit=${limit}`
    );
  },

  // ---- Org Units (Departments / Teams / Branches) ----

  async listOrgUnits(params?: { type?: OrgUnitNode['type']; parentId?: string | null }) {
    const query = new URLSearchParams();
    if (params?.type) query.set('type', params.type);
    if (params?.parentId !== undefined) query.set('parentId', params.parentId ?? 'null');
    const qs = query.toString();
    return apiClient.get<OrgUnitNode[]>(`${ORG_UNITS_BASE}${qs ? `?${qs}` : ''}`);
  },

  async getOrgUnit(id: string) {
    return apiClient.get<OrgUnitNode>(`${ORG_UNITS_BASE}/${id}`);
  },

  async createOrgUnit(payload: CreateOrgUnitPayload) {
    return apiClient.post<OrgUnitNode>(ORG_UNITS_BASE, payload);
  },

  async updateOrgUnit(id: string, payload: UpdateOrgUnitPayload) {
    return apiClient.patch<OrgUnitNode>(`${ORG_UNITS_BASE}/${id}`, payload);
  },

  async deleteOrgUnit(id: string) {
    return apiClient.delete<{ message: string }>(`${ORG_UNITS_BASE}/${id}`);
  },

  async moveOrgUnit(id: string, payload: MoveOrgUnitPayload) {
    return apiClient.patch<OrgUnitNode>(`${ORG_UNITS_BASE}/${id}/move`, payload);
  },
};