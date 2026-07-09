// frontend/modules/maintenance/store/maintenance-table.store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_MAINTENANCE_COLUMN_VISIBILITY,
  type MaintenanceColumnVisibility,
} from '../types';

interface MaintenanceTableState {
  columnVisibility: MaintenanceColumnVisibility;
  toggleColumn: (column: keyof MaintenanceColumnVisibility) => void;
  resetColumns: () => void;
}

export const useMaintenanceTableStore = create<MaintenanceTableState>()(
  persist(
    (set) => ({
      columnVisibility: DEFAULT_MAINTENANCE_COLUMN_VISIBILITY,
      toggleColumn: (column) =>
        set((state) => ({
          columnVisibility: {
            ...state.columnVisibility,
            [column]: !state.columnVisibility[column],
          },
        })),
      resetColumns: () => set({ columnVisibility: DEFAULT_MAINTENANCE_COLUMN_VISIBILITY }),
    }),
    { name: 'maintenance-table-preferences' }
  )
);