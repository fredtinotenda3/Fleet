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
  jobTrip?: string;
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

/** Powers the stacked category-over-time chart AND the category x month heatmap. */
export interface ExpenseCategoryOverTimePoint {
  category: string;
  month: string;
  amount: number;
  count: number;
}

/**
 * Rich per-category stats -- powers hover tooltips on the category chart
 * and the top-categories chart without any additional round trip: this
 * is fetched once per dashboard load, not per hover.
 */
export interface CategorySummary {
  category: string;
  total: number;
  count: number;
  average: number;
  min: number;
  max: number;
  latestDate: string | null;
  topVehicle: string | null;
  percentageOfTotal: number;
  /** null when no comparable prior period is available (no date range set). */
  momChangePercent: number | null;
}

/** Rich per-vehicle stats -- powers hover tooltips on vehicle charts. */
export interface TopVehicleExpenseRow {
  license_plate: string;
  totalAmount: number;
  expenseCount: number;
  topCategory: string;
  average: number;
  min: number;
  max: number;
  latestDate: string | null;
  momChangePercent: number | null;
}

export interface VehicleExpenseBreakdownRow {
  license_plate: string;
  category: string;
  amount: number;
  count: number;
}

export interface ExpenseAmountDistributionBucket {
  min: number;
  max: number;
  count: number;
}

export interface JobTripExpenseRow {
  jobTrip: string;
  category: string;
  amount: number;
  count: number;
}

/** Top N single transactions by amount -- flattened for direct chart/table use. */
export interface TopExpenseTransactionRow {
  _id: string;
  license_plate: string;
  category: string;
  amount: number;
  date: string;
  jobTrip: string | null;
  description: string | null;
}

/** Powers the calendar heatmap. */
export interface DailyExpenseTotal {
  date: string; // YYYY-MM-DD
  amount: number;
  count: number;
}

/** Statistical outliers -- amount more than `threshold` std-devs from that category's mean. */
export interface ExpenseOutlierRow {
  _id: string;
  license_plate: string;
  category: string;
  amount: number;
  date: string;
  categoryMean: number;
  categoryStdDev: number;
  zScore: number;
}