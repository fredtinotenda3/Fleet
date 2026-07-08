// frontend/modules/vehicles/store/vehicle-table.store.ts
//
// Client-only UI preferences for the vehicles table: column visibility,
// density, and "saved views" (named filter snapshots). Nothing here
// requires a backend endpoint — it's pure personalization on top of the
// real, server-backed list/filter data, mirroring the pattern used by
// frontend/shared/store/dashboard.store.ts for the dashboard widget layout.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_VEHICLE_COLUMN_VISIBILITY,
  type VehicleColumnVisibility,
  type VehicleTableFilters,
} from '../types';

export interface SavedVehicleView {
  id: string;
  name: string;
  filters: VehicleTableFilters;
}

interface VehicleTableState {
  columnVisibility: VehicleColumnVisibility;
  density: 'comfortable' | 'compact';
  savedViews: SavedVehicleView[];
  toggleColumn: (key: keyof VehicleColumnVisibility) => void;
  setDensity: (density: 'comfortable' | 'compact') => void;
  saveView: (name: string, filters: VehicleTableFilters) => void;
  deleteView: (id: string) => void;
  resetColumns: () => void;
}

export const useVehicleTableStore = create<VehicleTableState>()(
  persist(
    (set, get) => ({
      columnVisibility: DEFAULT_VEHICLE_COLUMN_VISIBILITY,
      density: 'comfortable',
      savedViews: [],

      toggleColumn: (key) =>
        set({ columnVisibility: { ...get().columnVisibility, [key]: !get().columnVisibility[key] } }),

      setDensity: (density) => set({ density }),

      saveView: (name, filters) =>
        set({
          savedViews: [
            ...get().savedViews.filter((v) => v.name !== name),
            { id: crypto.randomUUID(), name, filters },
          ],
        }),

      deleteView: (id) => set({ savedViews: get().savedViews.filter((v) => v.id !== id) }),

      resetColumns: () => set({ columnVisibility: DEFAULT_VEHICLE_COLUMN_VISIBILITY }),
    }),
    { name: 'fleet-vehicle-table' }
  )
);