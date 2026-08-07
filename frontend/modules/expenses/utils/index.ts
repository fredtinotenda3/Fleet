// frontend/modules/expenses/utils/index.ts

import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExportFormat } from '@/shared/export/export.types';
import { triggerExport, type ExportDownloadResult } from '@/shared/utils/export-download.utils';
import { expensesApi } from '../services/expenses.api';
import type { Expense, ExpenseTableFilters } from '../types';
import { Permission, permissionService } from '@/server/permissions/roles';

/**
 * Mirrors server/permissions/roles.ts's rolePermissions table for
 * EXPENSE_CREATE / EXPENSE_EDIT / EXPENSE_DELETE / EXPENSE_APPROVE.
 * fleet_manager only holds EXPENSE_VIEW server-side, so it's
 * intentionally excluded from the manage/delete/approve lists below --
 * keeping this in sync with the backend avoids showing actions the API
 * will 403 on.
 */
/**
 * BUTTON-VISIBILITY FIX.
 *
 * These used to be hardcoded role allowlists. Every one of them omitted
 * BRANCH_MANAGER, DEPARTMENT_MANAGER, WORKSHOP_MANAGER and
 * ORGANIZATION_ADMIN -- so harare.manager@ and bulawayo.manager@ saw no
 * "Add"/"Edit"/"Delete" controls anywhere, despite roles.ts granting them
 * VEHICLE_CREATE, VEHICLE_EDIT, FUEL_CREATE, EXPENSE_CREATE and the rest.
 *
 * A duplicated allowlist in the frontend cannot help but drift from
 * server/permissions/roles.ts, and when it drifts in this direction the
 * user simply cannot do their job; when it drifts the other way they get
 * a button that 403s. Delegating to permissionService means the button
 * and the endpoint that backs it read the SAME permission table.
 *
 * Scope is enforced separately and server-side: a user with no scope
 * assignment sees no rows, and unassigned@ (viewer) holds none of these
 * permissions, so no buttons render for them either.
 */


export function canManageExpenses(roles: string[]): boolean {
  return permissionService.hasAnyPermission(roles, [
    Permission.EXPENSE_CREATE,
    Permission.EXPENSE_EDIT,
  ]);
}

export function canDeleteExpenses(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.EXPENSE_DELETE);
}

export function canApproveExpenses(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.EXPENSE_APPROVE);
}

/**
 * FIX: the fallback here was the literal string 'All', not
 * 'Uncategorized'. A record with no expense_type_id set (a perfectly
 * legitimate, intentional "Uncategorized" expense -- see the
 * Uncategorized sentinel option in ExpenseForm's category Select) was
 * therefore displayed in the table/CSV/Excel exports as if its category
 * were "All", which reads like a broken filter value rather than "no
 * category was chosen". 'Uncategorized' matches the label already used
 * everywhere else in the app (the Select's own "Uncategorized" option,
 * the dashboard's "Uncategorized" byType key, etc.).
 */
export function expenseCategoryLabel(expense: Expense): string {
  return expense.expense_type?.name || expense.expense_type?.category || 'Uncategorized';
}

export function formatExpenseAmount(amount: number, currency: string = 'USD'): string {
  return formatCurrency(amount, { currency });
}

/**
 * Enterprise Export Framework (Phase 2). Replaces exportExpensesToCSV/
 * exportExpensesToExcel, which only ever exported the currently-loaded
 * page of expenses. Sends the user's current filters (including the
 * jobTrip filter, which lives outside ExpenseTableFilters) to
 * GET /api/expenses?action=export, which re-runs the same scoped/
 * filtered query server-side with no page limit (capped at
 * EXPORT_ROW_CAP) and returns a real file.
 */
export async function exportExpenses(
  filters: ExpenseTableFilters & { jobTrip?: string },
  format: ExportFormat = 'csv'
): Promise<ExportDownloadResult> {
  return triggerExport(
    () => expensesApi.exportFile(filters, format),
    `expenses-export.${format}`
  );
}

export function printExpenses(): void {
  window.print();
}