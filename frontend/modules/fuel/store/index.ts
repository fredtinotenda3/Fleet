// frontend/modules/fuel/store/index.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FuelColumnVisibility, DEFAULT_FUEL_COLUMN_VISIBILITY } from '../types';

interface FuelStoreState {
  columnVisibility: FuelColumnVisibility;
  setColumnVisibility: (visibility: Partial<FuelColumnVisibility>) => void;
  resetColumnVisibility: () => void;
}

export const useFuelStore = create<FuelStoreState>()(
  persist(
    (set) => ({
      columnVisibility: DEFAULT_FUEL_COLUMN_VISIBILITY,
      setColumnVisibility: (visibility) =>
        set((state) => ({
          columnVisibility: { ...state.columnVisibility, ...visibility },
        })),
      resetColumnVisibility: () =>
        set({ columnVisibility: DEFAULT_FUEL_COLUMN_VISIBILITY }),
    }),
    {
      name: 'fuel-store',
    }
  )
);