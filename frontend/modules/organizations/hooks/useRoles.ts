// frontend/modules/organizations/hooks/useRoles.ts

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { rolesApi } from '../services/roles.api';
import type {
  CustomRole,
  CustomRoleCreatePayload,
  CustomRoleUpdatePayload,
  PermissionDefinition,
  UserScopeAssignment,
  UserScopeAssignmentCreatePayload,
} from '../types';

export const roleKeys = {
  all: ['custom-roles'] as const,
  lists: () => [...roleKeys.all, 'list'] as const,
  detail: (id: string) => [...roleKeys.all, 'detail', id] as const,
};

export const permissionKeys = {
  all: ['permission-definitions'] as const,
  list: (category?: string) => [...permissionKeys.all, category ?? 'all'] as const,
};

export const scopeAssignmentKeys = {
  all: ['scope-assignments'] as const,
  forUser: (userId: string) => [...scopeAssignmentKeys.all, 'user', userId] as const,
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCustomRoles(activeOnly = true, options?: Partial<UseQueryOptions<CustomRole[]>>) {
  return useQuery({
    queryKey: [...roleKeys.lists(), activeOnly],
    queryFn: () => rolesApi.listRoles(activeOnly),
    staleTime: 60_000,
    ...options,
  });
}

export function useCustomRole(id: string | undefined, options?: Partial<UseQueryOptions<CustomRole>>) {
  return useQuery({
    queryKey: roleKeys.detail(id ?? ''),
    queryFn: () => rolesApi.getRole(id as string),
    enabled: Boolean(id),
    ...options,
  });
}

export function usePermissionDefinitions(
  category?: string,
  options?: Partial<UseQueryOptions<PermissionDefinition[]>>
) {
  return useQuery({
    queryKey: permissionKeys.list(category),
    queryFn: () => rolesApi.listPermissionDefinitions(category),
    staleTime: 5 * 60_000,
    ...options,
  });
}

export function useScopeAssignmentsForUser(
  userId: string | undefined,
  options?: Partial<UseQueryOptions<UserScopeAssignment[]>>
) {
  return useQuery({
    queryKey: scopeAssignmentKeys.forUser(userId ?? ''),
    queryFn: () => rolesApi.listScopeAssignmentsForUser(userId as string),
    enabled: Boolean(userId),
    ...options,
  });
}

export function useCreateCustomRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomRoleCreatePayload) => rolesApi.createRole(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
      toast.success('Role created');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to create role')),
  });
}

export function useUpdateCustomRole(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomRoleUpdatePayload) => rolesApi.updateRole(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(id) });
      toast.success('Role updated');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to update role')),
  });
}

export function useDeleteCustomRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rolesApi.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.lists() });
      toast.success('Role deleted');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to delete role')),
  });
}

export function useAssignScope() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UserScopeAssignmentCreatePayload) => rolesApi.assignScope(payload),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: scopeAssignmentKeys.forUser(variables.userId) });
      toast.success('Scope assigned');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to assign scope')),
  });
}

export function useRevokeScope(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rolesApi.revokeScope(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scopeAssignmentKeys.forUser(userId) });
      toast.success('Scope revoked');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to revoke scope')),
  });
}