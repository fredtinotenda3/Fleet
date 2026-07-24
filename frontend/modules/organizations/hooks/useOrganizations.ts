// frontend/modules/organizations/hooks/useOrganizations.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { organizationApi } from '../services/organization.api';
import { organizationKeys, orgUnitKeys } from './query-keys';
import type { Organization, OrganizationStatistics, OrgUnitNode } from '../types';

/**
 * All organizations the current user belongs to. Used by the org switcher
 * and the "my organizations" list view.
 */
export function useMyOrganizations(
  options?: Partial<UseQueryOptions<Organization[]>>
) {
  return useQuery({
    queryKey: organizationKeys.lists(),
    queryFn: () => organizationApi.getMyOrganizations(),
    staleTime: 60_000,
    ...options,
  });
}

export function useOrganization(
  id: string | undefined,
  options?: Partial<UseQueryOptions<Organization>>
) {
  return useQuery({
    queryKey: organizationKeys.detail(id ?? ''),
    queryFn: () => organizationApi.getOrganization(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

export function useOrganizationStatistics(
  id: string | undefined,
  options?: Partial<UseQueryOptions<OrganizationStatistics>>
) {
  return useQuery({
    queryKey: organizationKeys.statistics(id ?? ''),
    queryFn: () => organizationApi.getStatistics(id as string) as Promise<OrganizationStatistics>,
    enabled: Boolean(id),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    ...options,
  });
}

export function useOrganizationAuditLog(
  id: string | undefined,
  page = 1,
  limit = 20,
  options?: Partial<UseQueryOptions<unknown>>
) {
  return useQuery({
    queryKey: organizationKeys.auditLog(id ?? '', page, limit),
    queryFn: () => organizationApi.getAuditLog(id as string, page, limit),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

export function useOrgUnits(
  filters?: { type?: OrgUnitNode['type']; parentId?: string | null },
  options?: Partial<UseQueryOptions<OrgUnitNode[]>>
) {
  return useQuery({
    queryKey: orgUnitKeys.list(filters),
    queryFn: () => organizationApi.listOrgUnits(filters),
    staleTime: 60_000,
    ...options,
  });
}

export function useOrgUnit(
  id: string | undefined,
  options?: Partial<UseQueryOptions<OrgUnitNode>>
) {
  return useQuery({
    queryKey: orgUnitKeys.detail(id ?? ''),
    queryFn: () => organizationApi.getOrgUnit(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
    ...options,
  });
}

/**
 * Builds a nested tree from the flat org-unit list returned by the API,
 * using each node's parentId. Root nodes are those with parentId null.
 */
export function buildOrgUnitTree(units: OrgUnitNode[]): OrgUnitNode[] {
  const byId = new Map<string, OrgUnitNode>();
  units.forEach((u) => byId.set(u._id, { ...u, children: [] }));

  const roots: OrgUnitNode[] = [];
  byId.forEach((unit) => {
    if (unit.parentId && byId.has(unit.parentId)) {
      byId.get(unit.parentId)!.children!.push(unit);
    } else {
      roots.push(unit);
    }
  });

  return roots;
}