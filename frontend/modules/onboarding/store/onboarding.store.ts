// frontend/modules/onboarding/store/onboarding.store.ts
//
// Whether this person wants to keep seeing the setup panel.
//
// Client-side only, by design. Persisting a "dismissed onboarding" flag
// server-side would mean a new field on the user or organization document and
// a route to write it — a backend change this task is explicitly not to make.
// The cost of keeping it local is that dismissal does not follow the user to
// another browser, which is an acceptable trade for a panel that also
// auto-hides once setup is genuinely complete.
//
// Keyed by user id so that two accounts sharing a browser — common on a depot
// workstation — do not inherit each other's dismissal.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
  /** userId -> dismissed. Absent = never dismissed. */
  dismissed: Record<string, boolean>;
  isDismissed: (userId: string | undefined) => boolean;
  dismiss: (userId: string | undefined) => void;
  restore: (userId: string | undefined) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      dismissed: {},

      isDismissed: (userId) => (userId ? Boolean(get().dismissed[userId]) : false),

      dismiss: (userId) => {
        if (!userId) return;
        set({ dismissed: { ...get().dismissed, [userId]: true } });
      },

      restore: (userId) => {
        if (!userId) return;
        const next = { ...get().dismissed };
        delete next[userId];
        set({ dismissed: next });
      },
    }),
    { name: 'fleet-onboarding-store' }
  )
);
