// frontend/modules/maintenance/hooks/useMaintenanceDrawer.ts

import { useState, useCallback } from 'react';
import type { MaintenanceDrawerFilter } from '../components/MaintenanceRecordDrawer';

export function useMaintenanceDrawer() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<MaintenanceDrawerFilter | null>(null);

  const openDrawer = useCallback((f: MaintenanceDrawerFilter) => {
    setFilter(f);
    setOpen(true);
  }, []);

  return { open, setOpen, filter, openDrawer };
}
