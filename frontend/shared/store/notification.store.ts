
// frontend/shared/store/notification.store.ts
//
// UI-only state for the notification panel (open/closed, last-seen
// timestamp for the "new" pulse on the bell icon). Actual notification
// data is fetched/mutated via React Query against
// modules/notifications' API (see TopBar.tsx), not stored here.

import { create } from 'zustand';

interface NotificationUiState {
  panelOpen: boolean;
  lastSeenAt: string | null;
  setPanelOpen: (value: boolean) => void;
  togglePanel: () => void;
  markSeenNow: () => void;
}

export const useNotificationUiStore = create<NotificationUiState>()((set, get) => ({
  panelOpen: false,
  lastSeenAt: null,
  setPanelOpen: (value) => set({ panelOpen: value }),
  togglePanel: () => set({ panelOpen: !get().panelOpen }),
  markSeenNow: () => set({ lastSeenAt: new Date().toISOString() }),
}));