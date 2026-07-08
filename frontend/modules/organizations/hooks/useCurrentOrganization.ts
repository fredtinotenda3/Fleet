// frontend/modules/organizations/hooks/useCurrentOrganization.ts

import { useEffect, useMemo } from 'react';
import { useMyOrganizations, useOrganization } from './useOrganizations';
import { useOrganizationStore } from '../store/organization.store';
import type { Organization, OrganizationListItem, OrganizationRole } from '../types';

interface UseCurrentOrganizationResult {
  organization: Organization | undefined;
  organizations: OrganizationListItem[];
  currentUserRole: OrganizationRole | undefined;
  currentOrganizationId: string | null;
  isLoading: boolean;
  isError: boolean;
  switchOrganization: (organizationId: string) => void;
}

/**
 * Requires a `currentUserId` so it can resolve the caller's role within
 * the selected organization. Pass this from your auth hook/session,
 * e.g. `const { user } = useAuth(); useCurrentOrganization(user.id)`.
 */
export function useCurrentOrganization(currentUserId: string | undefined): UseCurrentOrganizationResult {
  const { data: rawOrganizations, isLoading: isListLoading, isError: isListError } =
    useMyOrganizations();
  const { currentOrganizationId, setCurrentOrganization, syncFromList } = useOrganizationStore();

  const organizations: OrganizationListItem[] = useMemo(() => {
    if (!rawOrganizations || !currentUserId) return [];
    return rawOrganizations.map((org) => {
      const membership = org.members.find((m) => m.userId === currentUserId);
      return {
        id: org._id!,
        name: org.name,
        slug: org.slug,
        logoUrl: org.branding.logoUrl,
        role: (membership?.role ?? 'viewer') as OrganizationRole,
        tier: org.subscription.tier,
        status: org.status,
        isDefault: org.ownerId === currentUserId,
      };
    });
  }, [rawOrganizations, currentUserId]);

  useEffect(() => {
    if (organizations.length > 0) {
      syncFromList(organizations);
    }
  }, [organizations, syncFromList]);

  const {
    data: organization,
    isLoading: isDetailLoading,
    isError: isDetailError,
  } = useOrganization(currentOrganizationId ?? undefined);

  const currentUserRole = useMemo(() => {
    if (!organization || !currentUserId) return undefined;
    return organization.members.find((m) => m.userId === currentUserId)?.role as
      | OrganizationRole
      | undefined;
  }, [organization, currentUserId]);

  return {
    organization,
    organizations,
    currentUserRole,
    currentOrganizationId,
    isLoading: isListLoading || (Boolean(currentOrganizationId) && isDetailLoading),
    isError: isListError || isDetailError,
    switchOrganization: setCurrentOrganization,
  };
}