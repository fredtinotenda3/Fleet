// frontend/modules/expenses/pages/ExpenseDashboardPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, List, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { ExpenseStatsCards } from '../components/ExpenseStatsCards';
import { ExpenseMonthlyTrendChart } from '../components/ExpenseMonthlyTrendChart';
import { ExpenseCategoryChart } from '../components/ExpenseCategoryChart';
import { ExpenseTopCategoriesChart } from '../components/ExpenseTopCategoriesChart';
import { ExpenseModal, type ExpenseModalMode } from '../components/ExpenseModal';
import { useCreateExpense } from '../hooks/useExpenseMutations';
import { canManageExpenses } from '../utils';
import { EXPENSE_ROUTES } from '../routes';
import type { ExpenseFormValues } from '../schemas';

export function ExpenseDashboardPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageExpenses(roles);

  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: ExpenseModalMode = 'create';
  const createExpense = useCreateExpense();

  async function handleSubmit(values: ExpenseFormValues) {
    await createExpense.mutateAsync(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Monitor fleet spending across every category and vehicle."
        breadcrumbs={[{ label: 'Expenses' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(EXPENSE_ROUTES.analytics)}>
              <BarChart3 className="h-3.5 w-3.5" /> Full analytics
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push(EXPENSE_ROUTES.list)}>
              <List className="h-3.5 w-3.5" /> All expenses
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Record expense
              </Button>
            )}
          </div>
        }
      />

      <ExpenseStatsCards />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseMonthlyTrendChart />
        <ExpenseCategoryChart />
      </div>

      <ExpenseTopCategoriesChart dateRange={{}} />

      <ExpenseModal open={modalOpen} mode={modalMode} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}