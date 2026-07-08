
// frontend/shared/store/ui.store.ts
//
// Chrome/shell state: sidebar collapse, mobile nav, command palette,
// favorites, and recently-viewed pages. Kept separate from
// notification.store.ts (panel-open state) and dashboard.store.ts
// (widget layout), matching the codebase's existing pattern of
// splitting concerns across small, focused stores rather than one
// monolithic app store.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_RECENT = 8;
const MAX_FAVORITES = 12;

interface FavoriteEntry {
  path: string;
  label: string;
}

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  favorites: FavoriteEntry[];
  recentlyViewed: FavoriteEntry[];

  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  setMobileNavOpen: (value: boolean) => void;
  setCommandPaletteOpen: (value: boolean) => void;
  toggleCommandPalette: () => void;

  isFavorite: (path: string) => boolean;
  toggleFavorite: (entry: FavoriteEntry) => void;
  trackVisit: (entry: FavoriteEntry) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandPaletteOpen: false,
      favorites: [],
      recentlyViewed: [],

      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      setMobileNavOpen: (value) => set({ mobileNavOpen: value }),
      setCommandPaletteOpen: (value) => set({ commandPaletteOpen: value }),
      toggleCommandPalette: () => set({ commandPaletteOpen: !get().commandPaletteOpen }),

      isFavorite: (path) => get().favorites.some((f) => f.path === path),

      toggleFavorite: (entry) => {
        const exists = get().favorites.some((f) => f.path === entry.path);
        const next = exists
          ? get().favorites.filter((f) => f.path !== entry.path)
          : [entry, ...get().favorites].slice(0, MAX_FAVORITES);
        set({ favorites: next });
      },

      trackVisit: (entry) => {
        const withoutDupe = get().recentlyViewed.filter((f) => f.path !== entry.path);
        set({ recentlyViewed: [entry, ...withoutDupe].slice(0, MAX_RECENT) });
      },
    }),
    {
      name: 'fleet-ui-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        favorites: state.favorites,
        recentlyViewed: state.recentlyViewed,
      }),
    }
  )
);