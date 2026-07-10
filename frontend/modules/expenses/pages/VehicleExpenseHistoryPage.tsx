
// frontend/modules/expenses/pages/VehicleExpenseHistoryPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useVehicleExpenseHistory } from '../hooks/useExpenses';
import { useCreateExpense } from '../hooks/useExpenseMutations';
import { ExpensesTable } from '../components/ExpensesTable';
import { ExpenseModal, type ExpenseModalMode } from '../components/ExpenseModal';
import { canManageExpenses, canDeleteExpenses, formatExpenseAmount } from '../utils';
import { EXPENSE_ROUTES } from '../routes';
import type { Expense } from '../types';
import type { ExpenseFormValues } from '../schemas';

interface VehicleExpenseHistoryPageProps {
  licensePlate: string;
}

export function VehicleExpenseHistoryPage({ licensePlate }: VehicleExpenseHistoryPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageExpenses(roles);
  const canDelete = canDeleteExpenses(roles);

  const [page, setPage] = useState(1);
  const { data: result, isLoading } = useVehicleExpenseHistory(licensePlate, page, 20);
  const createExpense = useCreateExpense();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: ExpenseModalMode = 'create';

  const expenses = result?.data ?? [];
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => (ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
  }

  async function handleSubmit(values: ExpenseFormValues) {
    await createExpense.mutateAsync({ ...values, license_plate: licensePlate });
  }

  const breadcrumbs = [{ label: 'Expenses', href: EXPENSE_ROUTES.dashboard }, { label: licensePlate }];
  const backButton = (
    <Button variant="outline" size="sm" onClick={() => router.push(EXPENSE_ROUTES.list)}>
      <ArrowLeft className="h-3.5 w-3.5" /> Back
    </Button>
  );

  if (!isLoading && expenses.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Expense history \u00b7 ${licensePlate}`} breadcrumbs={breadcrumbs} actions={backButton} />
        <EmptyState title="No expense history" description={`No expenses recorded for ${licensePlate} yet.`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Expense history \u00b7 ${licensePlate}`}
        description={`${expenses.length} entries \u00b7 ${formatExpenseAmount(totalAmount)} total`}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            {backButton}
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Record expense
              </Button>
            )}
          </div>
        }
      />

      <div className="p-4 surface-card">
        <ExpensesTable
          result={result}
          isLoading={isLoading}
          pageSize={20}
          onPageChange={setPage}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={(expense: Expense) => router.push(EXPENSE_ROUTES.detail(expense._id!))}
          onEdit={(expense: Expense) => router.push(EXPENSE_ROUTES.edit(expense._id!))}
          onDelete={() => {}}
          canManage={canManage}
          canDelete={canDelete}
          hideVehicleColumn
        />
      </div>

      <ExpenseModal
        open={modalOpen}
        mode={modalMode}
        defaultLicensePlate={licensePlate}
        onOpenChange={setModalOpen}
        onSubmit={handleSubmit}
      />
    </div>
  );
}