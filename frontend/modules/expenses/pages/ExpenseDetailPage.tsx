
// frontend/modules/expenses/pages/ExpenseDetailPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useExpense } from '../hooks/useExpenses';
import { useDeleteExpense, useUpdateExpense } from '../hooks/useExpenseMutations';
import { ExpenseModal, type ExpenseModalMode } from '../components/ExpenseModal';
import { canManageExpenses, canDeleteExpenses, expenseCategoryLabel, formatExpenseAmount } from '../utils';
import { formatDate } from '@/shared/utils/date.utils';
import { EXPENSE_ROUTES } from '../routes';
import type { ExpenseFormValues } from '../schemas';

interface ExpenseDetailPageProps {
  expenseId: string;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export function ExpenseDetailPage({ expenseId }: ExpenseDetailPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageExpenses(roles);
  const canDelete = canDeleteExpenses(roles);

  const { data: expense, isLoading, isError } = useExpense(expenseId);
  const deleteExpense = useDeleteExpense();
  const updateExpense = useUpdateExpense(expenseId);
  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: ExpenseModalMode = 'edit';

  if (isLoading) return <PageLoader label="Loading expense" />;

  if (isError || !expense) {
    return (
      <EmptyState
        title="Expense not found"
        description="This expense may have been removed or you don't have access to it."
        action={{ label: 'Back to expenses', onClick: () => router.push(EXPENSE_ROUTES.list) }}
      />
    );
  }

  async function handleDelete() {
    if (!window.confirm(`Delete this expense for ${expense!.license_plate}?`)) return;
    await deleteExpense.mutateAsync({ id: expenseId, soft: true });
    router.push(EXPENSE_ROUTES.list);
  }

  async function handleSubmit(values: ExpenseFormValues) {
    await updateExpense.mutateAsync(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Expense \u00b7 ${expense.license_plate}`}
        description={formatDate(expense.date, 'MMM dd, yyyy')}
        breadcrumbs={[
          { label: 'Expenses', href: EXPENSE_ROUTES.dashboard },
          { label: 'All expenses', href: EXPENSE_ROUTES.list },
          { label: expense.license_plate },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(EXPENSE_ROUTES.list)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        }
      />

      <Badge variant="outline">{expenseCategoryLabel(expense)}</Badge>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Expense overview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Vehicle" value={expense.license_plate} />
            <DetailRow label="Date" value={formatDate(expense.date)} />
            <DetailRow label="Amount" value={formatExpenseAmount(expense.amount)} />
            <DetailRow label="Category" value={expenseCategoryLabel(expense)} />
            <DetailRow label="Job / Trip" value={expense.jobTrip || 'Not recorded'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Additional details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Description" value={expense.description || 'Not recorded'} />
          </CardContent>
        </Card>

        {expense.notes && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap text-body-sm text-foreground">{expense.notes}</p></CardContent>
          </Card>
        )}
      </div>

      <ExpenseModal
        open={modalOpen}
        mode={modalMode}
        expense={expense}
        onOpenChange={setModalOpen}
        onSubmit={handleSubmit}
      />
    </div>
  );
}