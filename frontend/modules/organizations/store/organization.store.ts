// frontend/modules/organizations/store/organization.store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrganizationListItem } from '../types';

interface OrganizationStoreState {
  currentOrganizationId: string | null;
  recentOrganizationIds: string[];
  setCurrentOrganization: (organizationId: string) => void;
  clearCurrentOrganization: () => void;
  syncFromList: (organizations: OrganizationListItem[]) => void;
}

const MAX_RECENT = 5;

export const useOrganizationStore = create<OrganizationStoreState>()(
  persist(
    (set, get) => ({
      currentOrganizationId: null,
      recentOrganizationIds: [],

      setCurrentOrganization: (organizationId: string) => {
        const recent = [
          organizationId,
          ...get().recentOrganizationIds.filter((id) => id !== organizationId),
        ].slice(0, MAX_RECENT);

        set({
          currentOrganizationId: organizationId,
          recentOrganizationIds: recent,
        });
      },

      clearCurrentOrganization: () => set({ currentOrganizationId: null }),

      /**
       * Called after fetching the user's organization list so the store
       * can fall back to the user's default (or first) organization if
       * nothing has been explicitly selected yet, or if the previously
       * selected organization is no longer in the list (removed access).
       */
      syncFromList: (organizations: OrganizationListItem[]) => {
        const current = get().currentOrganizationId;
        const stillValid = current && organizations.some((o) => o.id === current);
        if (stillValid) return;

        const fallback =
          organizations.find((o) => o.isDefault)?.id ?? organizations[0]?.id ?? null;

        if (fallback) {
          set({ currentOrganizationId: fallback });
        }
      },
    }),
    {
      name: 'organization-store',
      partialize: (state) => ({
        currentOrganizationId: state.currentOrganizationId,
        recentOrganizationIds: state.recentOrganizationIds,
      }),
    }
  )
);