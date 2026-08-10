// frontend/modules/fuel/hooks/useFuelDrawer.ts

import { useState, useCallback } from 'react';
import type { FuelDrawerFilter } from '../components/FuelLogDrawer';

export function useFuelDrawer() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FuelDrawerFilter | null>(null);

  const openDrawer = useCallback((f: FuelDrawerFilter) => {
    setFilter(f);
    setOpen(true);
  }, []);

  return { open, setOpen, filter, openDrawer };
}