
// frontend/modules/expenses/hooks/useExpenses.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { expensesApi, type ExpenseListParams } from '../services/expenses.api';
import type { Expense } from '../types';

export const expenseKeys = {
  all: ['expenses'] as const,
  lists: () => [...expenseKeys.all, 'list'] as const,
  list: (params: Partial<ExpenseListParams>) => [...expenseKeys.lists(), params] as const,
  details: () => [...expenseKeys.all, 'detail'] as const,
  detail: (id: string) => [...expenseKeys.details(), id] as const,
  stats: (range?: string) => [...expenseKeys.all, 'stats', range] as const,
  monthly: (months: number) => [...expenseKeys.all, 'monthly', months] as const,
  types: () => [...expenseKeys.all, 'types'] as const,
};

export function useExpensesList(params: Partial<ExpenseListParams>) {
  return useQuery({
    queryKey: expenseKeys.list(params),
    queryFn: () => expensesApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useExpense(id: string | undefined, options?: Partial<UseQueryOptions<Expense>>) {
  return useQuery({
    queryKey: expenseKeys.detail(id ?? ''),
    queryFn: () => expensesApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

export function useExpenseStats(dateRange?: { startDate?: Date; endDate?: Date }) {
  const rangeKey = dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;

  return useQuery({
    queryKey: expenseKeys.stats(rangeKey),
    queryFn: () => expensesApi.getStats(dateRange),
    staleTime: 60_000,
  });
}

export function useExpenseMonthlyTrends(months: number = 12) {
  return useQuery({
    queryKey: expenseKeys.monthly(months),
    queryFn: () => expensesApi.getMonthlyTrends(months),
    staleTime: 60_000,
  });
}

export function useExpenseTypes(grouped: boolean = false) {
  return useQuery({
    queryKey: [...expenseKeys.types(), grouped],
    queryFn: () => expensesApi.getExpenseTypes(grouped),
    staleTime: 5 * 60_000,
  });
}

/** Powers the Vehicle Expense History page. */
export function useVehicleExpenseHistory(licensePlate: string | undefined, page = 1, limit = 20) {
  return useQuery({
    queryKey: expenseKeys.list({ license_plate: licensePlate, page, limit }),
    queryFn: () => expensesApi.list({ license_plate: licensePlate, page, limit }),
    enabled: Boolean(licensePlate),
    staleTime: 30_000,
  });
}