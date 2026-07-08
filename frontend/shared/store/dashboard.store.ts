// frontend/shared/store/dashboard.store.ts
//
// Persisted layout for the fleet dashboard's widget grid: which widgets
// are visible and in what order. Widget *definitions* (component,
// permission gating, size) live in frontend/shared/dashboards/WidgetRegistry.ts;
// this store only tracks the user's personalization on top of that
// registry, mirroring how organization.store.ts only persists the
// *selection* (currentOrganizationId) rather than organization data itself.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WidgetKey } from '@/frontend/shared/dashboards/WidgetRegistry';

export interface WidgetLayoutItem {
  key: WidgetKey;
  visible: boolean;
}

const DEFAULT_LAYOUT: WidgetLayoutItem[] = [
  { key: 'kpis', visible: true },
  { key: 'fleetStatus', visible: true },
  { key: 'aiRecommendations', visible: true },
  { key: 'maintenance', visible: true },
  { key: 'fuel', visible: true },
  { key: 'expenses', visible: true },
  { key: 'trips', visible: true },
  { key: 'alerts', visible: true },
  { key: 'map', visible: true },
];

interface DashboardState {
  layout: WidgetLayoutItem[];
  isCustomizing: boolean;
  setCustomizing: (value: boolean) => void;
  toggleWidgetVisibility: (key: WidgetKey) => void;
  reorder: (fromKey: WidgetKey, toKey: WidgetKey) => void;
  resetLayout: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      layout: DEFAULT_LAYOUT,
      isCustomizing: false,

      setCustomizing: (value) => set({ isCustomizing: value }),

      toggleWidgetVisibility: (key) =>
        set({
          layout: get().layout.map((item) =>
            item.key === key ? { ...item, visible: !item.visible } : item
          ),
        }),

      reorder: (fromKey, toKey) => {
        const layout = [...get().layout];
        const fromIndex = layout.findIndex((i) => i.key === fromKey);
        const toIndex = layout.findIndex((i) => i.key === toKey);
        if (fromIndex === -1 || toIndex === -1) return;
        const [moved] = layout.splice(fromIndex, 1);
        layout.splice(toIndex, 0, moved);
        set({ layout });
      },

      resetLayout: () => set({ layout: DEFAULT_LAYOUT, isCustomizing: false }),
    }),
    { name: 'fleet-dashboard-layout' }
  )
);
