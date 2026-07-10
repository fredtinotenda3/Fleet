
// frontend/modules/expenses/utils/index.ts

import { exportToCSV, type ExportColumn } from '@/shared/utils/csv.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { Expense } from '../types';

/**
 * Mirrors server/permissions/roles.ts's rolePermissions table for
 * EXPENSE_CREATE / EXPENSE_EDIT / EXPENSE_DELETE / EXPENSE_APPROVE.
 * fleet_manager only holds EXPENSE_VIEW server-side, so it's
 * intentionally excluded from the manage/delete/approve lists below —
 * keeping this in sync with the backend avoids showing actions the API
 * will 403 on.
 */
const MANAGE_ROLES = ['super_admin', 'organization_owner', 'accountant'];
const DELETE_ROLES = ['super_admin', 'organization_owner'];
const APPROVE_ROLES = ['super_admin', 'organization_owner', 'accountant'];

export function canManageExpenses(roles: string[]): boolean {
  return roles.some((role) => MANAGE_ROLES.includes(role));
}

export function canDeleteExpenses(roles: string[]): boolean {
  return roles.some((role) => DELETE_ROLES.includes(role));
}

export function canApproveExpenses(roles: string[]): boolean {
  return roles.some((role) => APPROVE_ROLES.includes(role));
}

export function expenseCategoryLabel(expense: Expense): string {
  return expense.expense_type?.name || expense.expense_type?.category || 'Uncategorized';
}

export function formatExpenseAmount(amount: number, currency: string = 'USD'): string {
  return formatCurrency(amount, { currency });
}

const EXPORT_COLUMNS: ExportColumn<Expense>[] = [
  { header: 'Date', accessor: (e) => formatDate(e.date) },
  { header: 'Vehicle', accessor: (e) => e.license_plate },
  { header: 'Category', accessor: (e) => expenseCategoryLabel(e) },
  { header: 'Amount', accessor: (e) => e.amount },
  { header: 'Job / Trip', accessor: (e) => e.jobTrip ?? '' },
  { header: 'Description', accessor: (e) => e.description ?? '' },
  { header: 'Notes', accessor: (e) => e.notes ?? '' },
];

export function exportExpensesToCSV(expenses: Expense[]): void {
  exportToCSV(expenses, EXPORT_COLUMNS, `expenses-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function exportExpensesToExcel(expenses: Expense[]): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = expenses.map((e) => ({
    Date: formatDate(e.date),
    Vehicle: e.license_plate,
    Category: expenseCategoryLabel(e),
    Amount: e.amount,
    'Job / Trip': e.jobTrip ?? '',
    Description: e.description ?? '',
    Notes: e.notes ?? '',
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses');
  XLSX.writeFile(workbook, `expenses-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function printExpenses(): void {
  window.print();
}