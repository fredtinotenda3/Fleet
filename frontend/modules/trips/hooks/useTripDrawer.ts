// frontend/modules/trips/hooks/useTripDrawer.ts

import { useState, useCallback } from 'react';
import type { TripDrawerFilter } from '../components/TripTransactionDrawer';

export function useTripDrawer() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<TripDrawerFilter | null>(null);

  const openDrawer = useCallback((f: TripDrawerFilter) => {
    setFilter(f);
    setOpen(true);
  }, []);

  return { open, setOpen, filter, openDrawer };
}