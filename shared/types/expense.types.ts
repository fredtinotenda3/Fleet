// shared/types/expense.types.ts

import { BaseEntity } from './common.types';

export interface ExpenseType extends BaseEntity {
  name: string;
  category: string;
  description?: string;
  isDefault?: boolean;
}

export interface Expense extends BaseEntity {
  license_plate: string;
  amount: number;
  date: Date;
  description?: string;
  jobTrip?: string;
  notes?: string;
  expense_type_id?: string;
  expense_type?: ExpenseType;
}

export interface ExpenseCreateDTO {
  license_plate: string;
  amount: number;
  date: Date | string;
  expense_type_id?: string | null;
  description?: string;
  jobTrip?: string;
  notes?: string;
}

export interface ExpenseUpdateDTO extends Partial<ExpenseCreateDTO> {
  _id: string;
}

export interface ExpenseFilters {
  license_plate?: string;
  type?: string;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export interface ExpenseStats {
  total: number;
  average: number;
  byType: Record<string, number>;
  byMonth: Record<string, number>;
  topCategories: Array<{ name: string; amount: number }>;
}

/** Powers the stacked category-over-time chart AND the category x month heatmap (same shape, two views). */
export interface ExpenseCategoryOverTimePoint {
  category: string;
  month: string;
  amount: number;
  count: number;
}

/** Powers "Top Vehicles by Expense" horizontal bar. */
export interface TopVehicleExpenseRow {
  license_plate: string;
  totalAmount: number;
  expenseCount: number;
  topCategory: string;
}

/** Powers "Vehicle Expense Breakdown" stacked bar (vehicle x category). */
export interface VehicleExpenseBreakdownRow {
  license_plate: string;
  category: string;
  amount: number;
  count: number;
}

/** Powers the expense amount histogram. */
export interface ExpenseAmountDistributionBucket {
  min: number;
  max: number;
  count: number;
}

/** Powers "Job / Trip Expense Analysis" stacked bar (job/trip x category). */
export interface JobTripExpenseRow {
  jobTrip: string;
  category: string;
  amount: number;
  count: number;
}