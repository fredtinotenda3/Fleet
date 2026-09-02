// frontend/modules/platform-admin/hooks/usePlatformAccess.ts
//
// TanStack Query hooks for the Users / Roles & Permissions / API keys /
// Audit log slice.
//
// PERMISSIONS ARE NOT UNIFORM ACROSS THIS SLICE, which is why each
// query carries its own gate rather than the pages sharing one:
//
//   GET /api/platform/organizations   PLATFORM_VIEW + literal SUPER_ADMIN
//   GET /api/security/roles           CUSTOM_ROLE_VIEW
//   GET /api/security/permissions     CUSTOM_ROLE_VIEW
//   GET /api/security/api-keys        API_KEY_VIEW
//   GET /api/security/audit-log       AUDIT_LOG_VIEW
//   member writes                     ORG_MEMBERS_MANAGE
//
// Every `enabled` below is a UI convenience -- it replaces a
// guaranteed 403 with a readable message -- and never the enforcement
// point. `withAuth` on each route remains that.

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Permission, permissionService } from '@/server/permissions/roles';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { ApiError } from '@/shared/utils/api-client.utils';
import { platformAccessApi } from '../services/platform-access.api';
import type {
  ApiKeyCreateResult,
  ApiKeySummary,
  AuditChainVerification,
  AuditLogListResult,
  AuditLogQueryParams,
  CreateApiKeyPayload,
  CustomRole,
  InviteMemberPayload,
  PermissionDefinition,
} from '../types';
import { platformAdminKeys } from './usePlatformOrganizations';

export const platformAccessKeys = {
  all: ['platform-admin', 'access'] as const,
  customRoles: (activeOnly: boolean) =>
    [...platformAccessKeys.all, 'custom-roles', activeOnly] as const,
  permissionDefinitions: (category?: string) =>
    [...platformAccessKeys.all, 'permission-definitions', category ?? 'all'] as const,
  apiKeys: (includeRevoked: boolean) =>
    [...platformAccessKeys.all, 'api-keys', includeRevoked] as const,
  auditLog: (params: AuditLogQueryParams) => [...platformAccessKeys.all, 'audit-log', params] as const,
  auditChain: (fromSequence: number) =>
    [...platformAccessKeys.all, 'audit-chain', fromSequence] as const,
};

/** A permission failure will not resolve by retrying with the same token. */
function retryUnlessForbidden(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && !(error instanceof ApiError && error.statusCode === 403);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * The permissions this slice's screens depend on, resolved once.
 *
 * Read from the session store rather than `useAuth()` so this stays a
 * plain data hook with no router dependency -- the same read
 * `useSavingsStripAccess` in the attention module makes.
 */
export function usePlatformAccessPermissions(): {
  roles: string[];
  canViewPlatform: boolean;
  canViewCustomRoles: boolean;
  canManageCustomRoles: boolean;
  canViewApiKeys: boolean;
  canManageApiKeys: boolean;
  canViewAuditLog: boolean;
  canManageMembers: boolean;
} {
  const { user } = useSessionStore();
  const roles = user?.roles ?? [];
  const has = (permission: Permission) => permissionService.hasPermission(roles, permission);

  return {
    roles,
    canViewPlatform: has(Permission.PLATFORM_VIEW),
    canViewCustomRoles: has(Permission.CUSTOM_ROLE_VIEW),
    canManageCustomRoles: has(Permission.CUSTOM_ROLE_MANAGE),
    canViewApiKeys: has(Permission.API_KEY_VIEW),
    canManageApiKeys: has(Permission.API_KEY_MANAGE),
    canViewAuditLog: has(Permission.AUDIT_LOG_VIEW),
    canManageMembers: has(Permission.ORG_MEMBERS_MANAGE),
  };
}

/** The signed-in user's own tenant id, which every member-write gate compares against. */
export function useSessionTenantId(): string | null {
  const { user } = useSessionStore();
  const tenantId = user?.tenantId?.trim();
  // An empty string is the deliberate "no tenant claim" sentinel the
  // session store writes (see useAuth's fail-open note), so it must
  // resolve to null here rather than matching an organization whose
  // identifier is also blank.
  return tenantId ? tenantId : null;
}

// ── Roles ─────────────────────────────────────────────────────────────

/**
 * GET /api/security/roles -- the caller's OWN organization's custom
 * roles. There is no cross-tenant role listing; a platform admin
 * viewing this sees their own tenant's roles, which the page states.
 */
export function useCustomRoles(
  options?: { activeOnly?: boolean; enabled?: boolean } & Partial<UseQueryOptions<CustomRole[]>>
) {
  const { canViewCustomRoles } = usePlatformAccessPermissions();
  const activeOnly = options?.activeOnly ?? true;

  return useQuery({
    queryKey: platformAccessKeys.customRoles(activeOnly),
    queryFn: () => platformAccessApi.listCustomRoles({ activeOnly }),
    enabled: (options?.enabled ?? true) && canViewCustomRoles,
    // A role definition changes when a person edits it, not on a timer.
    staleTime: 60_000,
    retry: retryUnlessForbidden,
  });
}

/**
 * GET /api/security/permissions -- the registry catalogue.
 *
 * A long staleTime because this is a process-global catalogue populated
 * at bootstrap, not stored data: within a session it does not change.
 */
export function usePermissionDefinitions(
  options?: { category?: string; enabled?: boolean } & Partial<UseQueryOptions<PermissionDefinition[]>>
) {
  const { canViewCustomRoles } = usePlatformAccessPermissions();

  return useQuery({
    queryKey: platformAccessKeys.permissionDefinitions(options?.category),
    queryFn: () => platformAccessApi.listPermissionDefinitions(options?.category),
    enabled: (options?.enabled ?? true) && canViewCustomRoles,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: retryUnlessForbidden,
  });
}

// ── API keys ──────────────────────────────────────────────────────────

/** GET /api/security/api-keys -- the caller's OWN organization's keys. */
export function useApiKeys(
  options?: { includeRevoked?: boolean; enabled?: boolean } & Partial<UseQueryOptions<ApiKeySummary[]>>
) {
  const { canViewApiKeys } = usePlatformAccessPermissions();
  const includeRevoked = options?.includeRevoked ?? false;

  return useQuery({
    queryKey: platformAccessKeys.apiKeys(includeRevoked),
    queryFn: () => platformAccessApi.listApiKeys({ includeRevoked }),
    enabled: (options?.enabled ?? true) && canViewApiKeys,
    staleTime: 30_000,
    retry: retryUnlessForbidden,
  });
}

/**
 * POST /api/security/api-keys.
 *
 * Returns the plaintext key ONCE. The mutation result is handed back to
 * the caller rather than only toasted, because the page has to render
 * it -- there is no second chance to fetch it, so a toast that scrolls
 * away would lose the key permanently.
 */
export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation<ApiKeyCreateResult, unknown, CreateApiKeyPayload>({
    mutationFn: (payload) => platformAccessApi.createApiKey(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: platformAccessKeys.all });
      toast.success(`API key "${result?.apiKey?.name ?? 'created'}" created`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Failed to create API key'));
    },
  });
}

/** DELETE /api/security/api-keys/:id. 409 when the key is already revoked. */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, unknown, { id: string; reason?: string }>({
    mutationFn: ({ id, reason }) => platformAccessApi.revokeApiKey(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAccessKeys.all });
      toast.success('API key revoked');
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Failed to revoke API key'));
    },
  });
}

// ── Audit log ─────────────────────────────────────────────────────────

/**
 * GET /api/security/audit-log.
 *
 * `placeholderData` keeps the previous page rendered while the next one
 * loads, so paging through a ledger does not blank the table on every
 * click. `staleTime` is short because new entries land continuously --
 * but there is no polling: an append-only ledger nobody is watching
 * does not need to be re-read on a timer.
 */
export function useAuditLog(
  params: AuditLogQueryParams,
  options?: { enabled?: boolean } & Partial<UseQueryOptions<AuditLogListResult>>
) {
  const { canViewAuditLog } = usePlatformAccessPermissions();

  return useQuery({
    queryKey: platformAccessKeys.auditLog(params),
    queryFn: () => platformAccessApi.listAuditLog(params),
    enabled: (options?.enabled ?? true) && canViewAuditLog,
    staleTime: 15_000,
    placeholderData: (previous) => previous,
    retry: retryUnlessForbidden,
  });
}

/**
 * GET /api/security/audit-log/verify.
 *
 * USER-INITIATED ONLY -- `enabled: false` by default, run via
 * `refetch()`. Two reasons: it walks the hash chain rather than reading
 * a cached flag, and a failed verification publishes an
 * AuditChainIntegrityFailureEvent server-side, so putting it on a page
 * load or a timer would generate events every time somebody opened the
 * screen.
 */
export function useVerifyAuditChain(fromSequence = 1) {
  const { canViewAuditLog } = usePlatformAccessPermissions();

  return useQuery<AuditChainVerification>({
    queryKey: platformAccessKeys.auditChain(fromSequence),
    queryFn: () => platformAccessApi.verifyAuditChain(fromSequence),
    enabled: false,
    gcTime: 5 * 60_000,
    retry: canViewAuditLog ? retryUnlessForbidden : false,
  });
}

// ── Member mutations ──────────────────────────────────────────────────
//
// EVERY hook below takes the organization id explicitly and must only
// be invoked for the caller's OWN organization -- see
// `canManageMembersFor()` in ../utils and constraint 3 in
// ../types/access.types.ts. The gate lives in the page (which knows the
// session and the viewed organization); these hooks carry the cache
// invalidation.

/** Invalidates every view that renders a member list, after any member write. */
function useMemberInvalidation() {
  const queryClient = useQueryClient();

  return (organizationId: string) => {
    // The detail page's own read.
    queryClient.invalidateQueries({
      queryKey: platformAdminKeys.organizationDetail(organizationId),
    });
    // The platform listing, which is what the Users directory is
    // derived from -- without this, the directory would keep showing a
    // member who was just suspended.
    queryClient.invalidateQueries({ queryKey: platformAdminKeys.organizations() });
    // The organizations module renders the same members at
    // /organizations/members.
    queryClient.invalidateQueries({ queryKey: ['organizations'] });
  };
}

/** POST /api/organizations/:id/members/invite. */
export function useInviteMember() {
  const invalidate = useMemberInvalidation();

  return useMutation<unknown, unknown, { organizationId: string; payload: InviteMemberPayload }>({
    mutationFn: ({ organizationId, payload }) =>
      platformAccessApi.inviteMember(organizationId, payload),
    onSuccess: (_result, variables) => {
      invalidate(variables.organizationId);
      toast.success(`Invitation sent to ${variables.payload.email}`);
    },
    onError: (error) => {
      // Surfaced verbatim: the server's own messages here are precise
      // and actionable ("Organization has reached its seat limit...",
      // "User is already a member of this organization").
      toast.error(errorMessage(error, 'Failed to send invitation'));
    },
  });
}

/** POST /api/organizations/:id/members/:memberId/suspend. */
export function useSuspendMember() {
  const invalidate = useMemberInvalidation();

  return useMutation<{ message: string }, unknown, { organizationId: string; memberId: string; email?: string }>({
    mutationFn: ({ organizationId, memberId }) =>
      platformAccessApi.suspendMember(organizationId, memberId),
    onSuccess: (_result, variables) => {
      invalidate(variables.organizationId);
      toast.success(`${variables.email ?? 'Member'} suspended`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Failed to suspend member'));
    },
  });
}

/** POST /api/organizations/:id/members/:memberId/restore. */
export function useRestoreMember() {
  const invalidate = useMemberInvalidation();

  return useMutation<{ message: string }, unknown, { organizationId: string; memberId: string; email?: string }>({
    mutationFn: ({ organizationId, memberId }) =>
      platformAccessApi.restoreMember(organizationId, memberId),
    onSuccess: (_result, variables) => {
      invalidate(variables.organizationId);
      toast.success(`${variables.email ?? 'Member'} restored`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Failed to restore member'));
    },
  });
}

/** PATCH /api/organizations/:id/members/:memberId -- assigns a STATIC role. */
export function useUpdateMemberRole() {
  const invalidate = useMemberInvalidation();

  return useMutation<
    { message: string },
    unknown,
    { organizationId: string; memberId: string; role: string; email?: string }
  >({
    mutationFn: ({ organizationId, memberId, role }) =>
      platformAccessApi.updateMemberRole(organizationId, memberId, { role }),
    onSuccess: (_result, variables) => {
      invalidate(variables.organizationId);
      toast.success(`${variables.email ?? 'Member'} role updated`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Failed to update member role'));
    },
  });
}

/** DELETE /api/organizations/:id/members/:memberId. */
export function useRemoveMember() {
  const invalidate = useMemberInvalidation();

  return useMutation<{ message: string }, unknown, { organizationId: string; memberId: string; email?: string }>({
    mutationFn: ({ organizationId, memberId }) =>
      platformAccessApi.removeMember(organizationId, memberId),
    onSuccess: (_result, variables) => {
      invalidate(variables.organizationId);
      toast.success(`${variables.email ?? 'Member'} removed`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Failed to remove member'));
    },
  });
}
