// frontend/modules/organizations/services/roles.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type {
  CustomRole,
  CustomRoleCreatePayload,
  CustomRoleUpdatePayload,
  PermissionDefinition,
  UserScopeAssignment,
  UserScopeAssignmentCreatePayload,
} from '../types';

const ROLES_BASE = '/api/security/roles';
const PERMISSIONS_BASE = '/api/security/permissions';
const SCOPE_ASSIGNMENTS_BASE = '/api/security/scope-assignments';

export const rolesApi = {
  async listRoles(activeOnly = true): Promise<CustomRole[]> {
    return apiClient.get<CustomRole[]>(`${ROLES_BASE}?activeOnly=${activeOnly}`);
  },

  async getRole(id: string): Promise<CustomRole> {
    return apiClient.get<CustomRole>(`${ROLES_BASE}/${id}`);
  },

  async createRole(payload: CustomRoleCreatePayload): Promise<CustomRole> {
    return apiClient.post<CustomRole>(ROLES_BASE, payload);
  },

  async updateRole(id: string, payload: CustomRoleUpdatePayload): Promise<CustomRole> {
    return apiClient.patch<CustomRole>(`${ROLES_BASE}/${id}`, payload);
  },

  async deleteRole(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${ROLES_BASE}/${id}`);
  },

  async listPermissionDefinitions(category?: string): Promise<PermissionDefinition[]> {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    return apiClient.get<PermissionDefinition[]>(`${PERMISSIONS_BASE}${qs}`);
  },

  async listScopeAssignmentsForUser(userId: string): Promise<UserScopeAssignment[]> {
    return apiClient.get<UserScopeAssignment[]>(`${SCOPE_ASSIGNMENTS_BASE}?userId=${userId}`);
  },

  async assignScope(payload: UserScopeAssignmentCreatePayload): Promise<UserScopeAssignment> {
    return apiClient.post<UserScopeAssignment>(SCOPE_ASSIGNMENTS_BASE, payload);
  },

  async revokeScope(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${SCOPE_ASSIGNMENTS_BASE}/${id}`);
  },
};