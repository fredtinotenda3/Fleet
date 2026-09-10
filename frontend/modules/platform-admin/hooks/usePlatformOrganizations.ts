// frontend/modules/platform-admin/hooks/usePlatformOrganizations.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { platformAdminApi } from '../services/platform-admin.api';
import type {
  CreateOrgUnitPayload,
  CreateOrganizationPayload,
  PlatformOrganizationListParams,
  SetOrganizationStatusPayload,
} from '../types';

export const platformAdminKeys = {
  all: ['platform-admin'] as const,
  organizations: () => [...platformAdminKeys.all, 'organizations'] as const,
  organizationList: (params?: PlatformOrganizationListParams) =>
    [...platformAdminKeys.organizations(), 'list', params ?? {}] as const,
  organizationDetail: (id: string) =>
    [...platformAdminKeys.organizations(), 'detail', id] as const,
  stats: () => [...platformAdminKeys.all, 'stats'] as const,
  /**
   * Org units are keyed by the TENANT they belong to, not by the
   * organization whose page is open. The endpoint answers only for the
   * caller's own tenant (see ../services), so keying on the viewed
   * organization would cache one tenant's units under another's id the
   * moment that assumption ever changed.
   */
  orgUnits: (tenantId: string) => [...platformAdminKeys.all, 'org-units', tenantId] as const,
};

/** GET /api/platform/organizations. `enabled: false` when the caller lacks access. */
export function usePlatformOrganizations(
  params?: PlatformOrganizationListParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: platformAdminKeys.organizationList(params),
    queryFn: () => platformAdminApi.listOrganizations(params),
    enabled: options?.enabled ?? true,
    // An organization list changes on a human timescale (a tenant is
    // created, suspended), so there is no polling here -- unlike
    // provider health, which tracks a sync cadence. Refetch is on
    // mount, on window focus, and after a mutation invalidates.
    staleTime: 30_000,
  });
}

/** GET /api/platform/organizations/:id. */
export function usePlatformOrganization(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: platformAdminKeys.organizationDetail(id),
    queryFn: () => platformAdminApi.getOrganization(id),
    enabled: (options?.enabled ?? true) && Boolean(id),
    staleTime: 30_000,
  });
}

/** GET /api/platform/stats. */
export function usePlatformStats(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: platformAdminKeys.stats(),
    queryFn: () => platformAdminApi.getStats(),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

/**
 * GET /api/tenancy/org-units.
 *
 * `tenantId` is the CALLER's tenant and is used only for the cache key
 * -- it is not sent, because the endpoint reads it from the session.
 * Only correct for the caller's OWN organization; every other
 * organization's page uses `useOrganizationOrgUnits` below.
 */
export function useOrgUnitsForTenant(tenantId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: platformAdminKeys.orgUnits(tenantId),
    queryFn: () => platformAdminApi.listOrgUnits(),
    enabled: (options?.enabled ?? true) && Boolean(tenantId),
    staleTime: 60_000,
  });
}

/**
 * GET /api/platform/organizations/:id/org-units.
 *
 * Keyed by the ORGANIZATION being viewed, not by the caller's tenant.
 * That difference is the whole point: the previous hook could only ever
 * answer for the session's own organization, so the platform-admin page
 * had to refuse to render the section at all rather than show one
 * tenant's branches under another tenant's name.
 */
export function useOrganizationOrgUnits(organizationId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: platformAdminKeys.orgUnits(organizationId),
    queryFn: () => platformAdminApi.listOrganizationOrgUnits(organizationId),
    enabled: (options?.enabled ?? true) && Boolean(organizationId),
    staleTime: 60_000,
  });
}

/** POST /api/platform/organizations/:id/org-units. */
export function useCreateOrganizationOrgUnit(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateOrgUnitPayload) =>
      platformAdminApi.createOrganizationOrgUnit(organizationId, payload),
    onSuccess: (unit) => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.orgUnits(organizationId) });
      // The organizations module renders the same collection on
      // /organizations/teams for the caller's own tenant; invalidating
      // its key keeps the two screens from disagreeing when the platform
      // admin happens to be editing their own organization.
      queryClient.invalidateQueries({ queryKey: ['org-units'] });
      toast.success(`${unit?.name ?? 'Org unit'} created`);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create org unit');
    },
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateOrganizationPayload) =>
      platformAdminApi.createOrganization(payload),
    onSuccess: (organization) => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.organizations() });
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.stats() });
      toast.success(`Organization "${organization?.name ?? 'created'}" created`);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create organization');
    },
  });
}

export function useSetOrganizationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }: SetOrganizationStatusPayload & { id: string }) =>
      platformAdminApi.setOrganizationStatus(id, payload),
    onSuccess: (organization, variables) => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.organizations() });
      queryClient.invalidateQueries({
        queryKey: platformAdminKeys.organizationDetail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.stats() });
      toast.success(`Status set to ${organization?.status ?? variables.status}`);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    },
  });
}

export function useCreateOrgUnit(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateOrgUnitPayload) => platformAdminApi.createOrgUnit(payload),
    onSuccess: (unit) => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.orgUnits(tenantId) });
      // The organizations module renders the same collection on
      // /organizations/teams; invalidating its key too keeps the two
      // screens from disagreeing after a create here.
      queryClient.invalidateQueries({ queryKey: ['org-units'] });
      toast.success(`${unit?.name ?? 'Org unit'} created`);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create org unit');
    },
  });
}
