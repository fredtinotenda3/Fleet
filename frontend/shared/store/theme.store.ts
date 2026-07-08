
// frontend/shared/store/theme.store.ts
//
// Presentation-density and chrome preferences that live alongside (but
// independent of) next-themes' light/dark/system mode, which is already
// handled by <ThemeProvider> in app/layout.tsx. This store only tracks
// UI density and whether motion/animations should be reduced beyond the
// OS-level `prefers-reduced-motion` query already respected in globals.css.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UiDensity = 'comfortable' | 'compact';

interface ThemeState {
  density: UiDensity;
  reducedMotion: boolean;
  setDensity: (density: UiDensity) => void;
  toggleDensity: () => void;
  setReducedMotion: (value: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      density: 'comfortable',
      reducedMotion: false,
      setDensity: (density) => set({ density }),
      toggleDensity: () =>
        set({ density: get().density === 'comfortable' ? 'compact' : 'comfortable' }),
      setReducedMotion: (value) => set({ reducedMotion: value }),
    }),
    { name: 'fleet-theme-prefs' }
  )
);