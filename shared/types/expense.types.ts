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