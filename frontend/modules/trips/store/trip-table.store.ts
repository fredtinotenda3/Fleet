// frontend/modules/trips/store/trip-table.store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_TRIP_COLUMN_VISIBILITY,
  type TripColumnVisibility,
  type TripTableFilters,
} from '../types';

export interface SavedTripView {
  id: string;
  name: string;
  filters: TripTableFilters;
}

interface TripTableState {
  columnVisibility: TripColumnVisibility;
  density: 'comfortable' | 'compact';
  savedViews: SavedTripView[];
  toggleColumn: (key: keyof TripColumnVisibility) => void;
  setDensity: (density: 'comfortable' | 'compact') => void;
  saveView: (name: string, filters: TripTableFilters) => void;
  deleteView: (id: string) => void;
  resetColumns: () => void;
}

export const useTripTableStore = create<TripTableState>()(
  persist(
    (set, get) => ({
      columnVisibility: DEFAULT_TRIP_COLUMN_VISIBILITY,
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

      resetColumns: () => set({ columnVisibility: DEFAULT_TRIP_COLUMN_VISIBILITY }),
    }),
    { name: 'fleet-trip-table' }
  )
);