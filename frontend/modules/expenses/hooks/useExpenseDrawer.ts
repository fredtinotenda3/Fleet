// frontend/modules/expenses/hooks/useExpenseDrawer.ts

import { useState, useCallback } from 'react';
import type { ExpenseDrawerFilter } from '../components/ExpenseTransactionDrawer';

export function useExpenseDrawer() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ExpenseDrawerFilter | null>(null);

  const openDrawer = useCallback((f: ExpenseDrawerFilter) => {
    setFilter(f);
    setOpen(true);
  }, []);

  return { open, setOpen, filter, openDrawer };
}