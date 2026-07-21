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
  stats: (range?: string) => [...expenseKeys.all, 'stats', range] as const,
  monthly: (months: number) => [...expenseKeys.all, 'monthly', months] as const,
  types: () => [...expenseKeys.all, 'types'] as const,
  categoryOverTime: (range?: string) => [...expenseKeys.all, 'category-over-time', range] as const,
  topVehicles: (range?: string, limit?: number) => [...expenseKeys.all, 'top-vehicles', range, limit] as const,
  vehicleBreakdown: (range?: string, limit?: number) => [...expenseKeys.all, 'vehicle-breakdown', range, limit] as const,
  amountDistribution: (range?: string) => [...expenseKeys.all, 'amount-distribution', range] as const,
  jobTrip: (range?: string, limit?: number) => [...expenseKeys.all, 'job-trip', range, limit] as const,
  categorySummary: (range?: string) => [...expenseKeys.all, 'category-summary', range] as const,
  topTransactions: (range?: string, limit?: number) => [...expenseKeys.all, 'top-transactions', range, limit] as const,
  dailyTotals: (range?: string) => [...expenseKeys.all, 'daily-totals', range] as const,
  outliers: (range?: string, z?: number) => [...expenseKeys.all, 'outliers', range, z] as const,
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
  const hasCompleteRange = Boolean(dateRange?.startDate && dateRange?.endDate);
  const effectiveRange = hasCompleteRange ? dateRange : undefined;
  const key = effectiveRange
    ? `${effectiveRange.startDate!.toISOString()}-${effectiveRange.endDate!.toISOString()}`
    : undefined;

  return useQuery({
    queryKey: expenseKeys.stats(key),
    queryFn: () => expensesApi.getStats(effectiveRange),
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

export function useVehicleExpenseHistory(licensePlate: string | undefined, page = 1, limit = 20) {
  return useQuery({
    queryKey: expenseKeys.list({ license_plate: licensePlate, page, limit }),
    queryFn: () => expensesApi.list({ license_plate: licensePlate, page, limit }),
    enabled: Boolean(licensePlate),
    staleTime: 30_000,
  });
}

export function useExpenseCategoryOverTime(dateRange?: DateRange) {
  return useQuery({
    queryKey: expenseKeys.categoryOverTime(rangeKey(dateRange)),
    queryFn: () => expensesApi.getCategoryOverTime(dateRange),
    staleTime: 60_000,
  });
}

export function useTopVehiclesByExpense(dateRange?: DateRange, limit: number = 10) {
  return useQuery({
    queryKey: expenseKeys.topVehicles(rangeKey(dateRange), limit),
    queryFn: () => expensesApi.getTopVehicles(dateRange, limit),
    staleTime: 60_000,
  });
}

export function useVehicleExpenseBreakdown(dateRange?: DateRange, vehicleLimit: number = 8) {
  return useQuery({
    queryKey: expenseKeys.vehicleBreakdown(rangeKey(dateRange), vehicleLimit),
    queryFn: () => expensesApi.getVehicleBreakdown(dateRange, vehicleLimit),
    staleTime: 60_000,
  });
}

export function useExpenseAmountDistribution(dateRange?: DateRange) {
  return useQuery({
    queryKey: expenseKeys.amountDistribution(rangeKey(dateRange)),
    queryFn: () => expensesApi.getAmountDistribution(dateRange),
    staleTime: 60_000,
  });
}

export function useJobTripExpense(dateRange?: DateRange, jobLimit: number = 10) {
  return useQuery({
    queryKey: expenseKeys.jobTrip(rangeKey(dateRange), jobLimit),
    queryFn: () => expensesApi.getJobTripExpense(dateRange, jobLimit),
    staleTime: 60_000,
  });
}

/** Rich per-category stats -- feeds hover tooltips with zero extra network calls per hover. */
export function useExpenseCategorySummary(dateRange?: DateRange) {
  return useQuery({
    queryKey: expenseKeys.categorySummary(rangeKey(dateRange)),
    queryFn: () => expensesApi.getCategorySummary(dateRange),
    staleTime: 60_000,
  });
}

export function useTopExpenseTransactions(dateRange?: DateRange, limit: number = 10) {
  return useQuery({
    queryKey: expenseKeys.topTransactions(rangeKey(dateRange), limit),
    queryFn: () => expensesApi.getTopTransactions(dateRange, limit),
    staleTime: 60_000,
  });
}

export function useDailyExpenseTotals(dateRange?: DateRange) {
  return useQuery({
    queryKey: expenseKeys.dailyTotals(rangeKey(dateRange)),
    queryFn: () => expensesApi.getDailyTotals(dateRange),
    staleTime: 60_000,
  });
}

export function useExpenseOutliers(dateRange?: DateRange, zThreshold: number = 2.5) {
  return useQuery({
    queryKey: expenseKeys.outliers(rangeKey(dateRange), zThreshold),
    queryFn: () => expensesApi.getOutliers(dateRange, zThreshold),
    staleTime: 60_000,
  });
}