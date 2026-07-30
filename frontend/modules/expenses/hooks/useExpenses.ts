// frontend/modules/expenses/hooks/useExpenses.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { expensesApi, type ExpenseListParams } from '../services/expenses.api';
import type { Expense } from '../types';

type DateRange = { startDate?: Date; endDate?: Date } | undefined;

function rangeKey(dateRange: DateRange): string | undefined {
  return dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;
}

export const expenseKeys = {
  all: ['expenses'] as const,
  lists: () => [...expenseKeys.all, 'list'] as const,
  list: (params: Partial<ExpenseListParams>) => [...expenseKeys.lists(), params] as const,
  details: () => [...expenseKeys.all, 'detail'] as const,
  detail: (id: string) => [...expenseKeys.details(), id] as const,
  stats: (range?: string, scope?: string) => [...expenseKeys.all, 'stats', range, scope] as const,
  monthly: (months: number, scope?: string) => [...expenseKeys.all, 'monthly', months, scope] as const,
  types: () => [...expenseKeys.all, 'types'] as const,
  categoryOverTime: (range?: string, scope?: string) => [...expenseKeys.all, 'category-over-time', range, scope] as const,
  topVehicles: (range?: string, limit?: number, scope?: string) => [...expenseKeys.all, 'top-vehicles', range, limit, scope] as const,
  vehicleBreakdown: (range?: string, limit?: number, scope?: string) =>
    [...expenseKeys.all, 'vehicle-breakdown', range, limit, scope] as const,
  amountDistribution: (range?: string, scope?: string) => [...expenseKeys.all, 'amount-distribution', range, scope] as const,
  jobTrip: (range?: string, limit?: number, scope?: string) => [...expenseKeys.all, 'job-trip', range, limit, scope] as const,
  categorySummary: (range?: string, scope?: string) => [...expenseKeys.all, 'category-summary', range, scope] as const,
  topTransactions: (range?: string, limit?: number, scope?: string) =>
    [...expenseKeys.all, 'top-transactions', range, limit, scope] as const,
  dailyTotals: (range?: string, scope?: string) => [...expenseKeys.all, 'daily-totals', range, scope] as const,
  outliers: (range?: string, z?: number, scope?: string) => [...expenseKeys.all, 'outliers', range, z, scope] as const,
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

/**
 * Vehicle-Level Analytics: pass `licensePlate` to scope this hook (and
 * every other analytics hook below) to a single vehicle -- the same
 * pattern already used throughout useFuel.ts.
 */
export function useExpenseStats(dateRange?: { startDate?: Date; endDate?: Date }, licensePlate?: string) {
  const hasCompleteRange = Boolean(dateRange?.startDate && dateRange?.endDate);
  const effectiveRange = hasCompleteRange ? dateRange : undefined;
  const key = effectiveRange
    ? `${effectiveRange.startDate!.toISOString()}-${effectiveRange.endDate!.toISOString()}`
    : undefined;

  return useQuery({
    queryKey: expenseKeys.stats(key, licensePlate),
    queryFn: () => expensesApi.getStats(effectiveRange, licensePlate),
    staleTime: 60_000,
  });
}

export function useExpenseMonthlyTrends(months: number = 12, licensePlate?: string) {
  return useQuery({
    queryKey: expenseKeys.monthly(months, licensePlate),
    queryFn: () => expensesApi.getMonthlyTrends(months, licensePlate),
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

export function useVehicleExpenseHistory(licensePlate: string | undefined, page = 1, limit = 20) {
  return useQuery({
    queryKey: expenseKeys.list({ license_plate: licensePlate, page, limit }),
    queryFn: () => expensesApi.list({ license_plate: licensePlate, page, limit }),
    enabled: Boolean(licensePlate),
    staleTime: 30_000,
  });
}

export function useExpenseCategoryOverTime(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: expenseKeys.categoryOverTime(rangeKey(dateRange), licensePlate),
    queryFn: () => expensesApi.getCategoryOverTime(dateRange, licensePlate),
    staleTime: 60_000,
  });
}

export function useTopVehiclesByExpense(dateRange?: DateRange, limit: number = 10, licensePlate?: string) {
  return useQuery({
    queryKey: expenseKeys.topVehicles(rangeKey(dateRange), limit, licensePlate),
    queryFn: () => expensesApi.getTopVehicles(dateRange, limit, licensePlate),
    staleTime: 60_000,
  });
}

export function useVehicleExpenseBreakdown(dateRange?: DateRange, vehicleLimit: number = 8, licensePlate?: string) {
  return useQuery({
    queryKey: expenseKeys.vehicleBreakdown(rangeKey(dateRange), vehicleLimit, licensePlate),
    queryFn: () => expensesApi.getVehicleBreakdown(dateRange, vehicleLimit, licensePlate),
    staleTime: 60_000,
  });
}

export function useExpenseAmountDistribution(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: expenseKeys.amountDistribution(rangeKey(dateRange), licensePlate),
    queryFn: () => expensesApi.getAmountDistribution(dateRange, licensePlate),
    staleTime: 60_000,
  });
}

export function useJobTripExpense(dateRange?: DateRange, jobLimit: number = 10, licensePlate?: string) {
  return useQuery({
    queryKey: expenseKeys.jobTrip(rangeKey(dateRange), jobLimit, licensePlate),
    queryFn: () => expensesApi.getJobTripExpense(dateRange, jobLimit, licensePlate),
    staleTime: 60_000,
  });
}

export function useExpenseCategorySummary(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: expenseKeys.categorySummary(rangeKey(dateRange), licensePlate),
    queryFn: () => expensesApi.getCategorySummary(dateRange, licensePlate),
    staleTime: 60_000,
  });
}

export function useTopExpenseTransactions(dateRange?: DateRange, limit: number = 10, licensePlate?: string) {
  return useQuery({
    queryKey: expenseKeys.topTransactions(rangeKey(dateRange), limit, licensePlate),
    queryFn: () => expensesApi.getTopTransactions(dateRange, limit, licensePlate),
    staleTime: 60_000,
  });
}

export function useDailyExpenseTotals(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: expenseKeys.dailyTotals(rangeKey(dateRange), licensePlate),
    queryFn: () => expensesApi.getDailyTotals(dateRange, licensePlate),
    staleTime: 60_000,
  });
}

export function useExpenseOutliers(dateRange?: DateRange, zThreshold: number = 2.5, licensePlate?: string) {
  return useQuery({
    queryKey: expenseKeys.outliers(rangeKey(dateRange), zThreshold, licensePlate),
    queryFn: () => expensesApi.getOutliers(dateRange, zThreshold, 25, licensePlate),
    staleTime: 60_000,
  });
}