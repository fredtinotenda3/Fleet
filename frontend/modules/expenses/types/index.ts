
// frontend/modules/expenses/types/index.ts

import type { Expense, ExpenseType, ExpenseFilters, ExpenseStats } from '@/shared/types/expense.types';
import type { PaginatedResponse } from '@/shared/types/common.types';

export type { Expense, ExpenseType, ExpenseFilters, ExpenseStats, PaginatedResponse };

export interface ExpenseTableFilters {
  license_plate?: string;
  type?: string;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export interface ExpenseTypeGroup {
  category: string;
  types: ExpenseType[];
}

/**
 * Suggested category groups shown when creating a new expense type.
 * These are NOT enforced server-side — expense_types are freeform records
 * (see modules/expenses/repositories/expense-type.repository.ts) grouped
 * by their own `category` string field. This list only seeds the "Group"
 * dropdown in the quick-add category dialog.
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Fuel',
  'Maintenance',
  'Repairs',
  'Insurance',
  'Licensing',
  'Registration',
  'Parking',
  'Toll Fees',
  'Driver Expenses',
  'Tires',
  'Cleaning',
  'Fines',
  'Parts',
  'Rentals',
  'Taxes',
  'Miscellaneous',
] as const;

export type ExpenseCategory = (typeof DEFAULT_EXPENSE_CATEGORIES)[number];