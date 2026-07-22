// modules/expenses/export/expense-export.columns.ts
//
// Column definitions for the Expenses export. Mirrors
// EXPORT_COLUMNS in frontend/modules/expenses/utils/index.ts,
// including the 'Uncategorized' fallback fix documented there --
// expense_type is populated by ExpenseRepository's
// expenseTypeLookupStages() $lookup, which the new
// getFilteredExpensesForExport() reuses.

import type { ExportColumn } from '@/shared/export';
import type { Expense } from '@/shared/types/expense.types';

function expenseCategoryLabel(expense: Expense): string {
  return expense.expense_type?.name || (expense.expense_type as { category?: string } | undefined)?.category || 'Uncategorized';
}

export const EXPENSE_EXPORT_COLUMNS: ExportColumn<Expense>[] = [
  { header: 'Date', accessor: (e) => new Date(e.date).toISOString().slice(0, 10) },
  { header: 'Vehicle', accessor: (e) => e.license_plate },
  { header: 'Category', accessor: (e) => expenseCategoryLabel(e) },
  { header: 'Amount', accessor: (e) => e.amount },
  { header: 'Job / Trip', accessor: (e) => e.jobTrip ?? '' },
  { header: 'Description', accessor: (e) => e.description ?? '' },
  { header: 'Notes', accessor: (e) => e.notes ?? '' },
];

export const EXPENSE_EXPORT_SHEET_NAME = 'Expenses';
export const EXPENSE_EXPORT_BASE_FILENAME = 'expenses-export';