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

/**
 * FIX: previously, ANY truthy `dateRange` object -- even one with only
 * `startDate` set, or one that was accidentally always populated by the
 * caller's default state (e.g. a page component defaulting to "last 10
 * days" while its UI showed an "all" filter as selected) -- was passed
 * straight through to expensesApi.getStats(), which sends whichever of
 * startDate/endDate are present to GetExpenseStatsHandler ->
 * ExpenseRepository.getExpenseStats(), which then applies a real Mongo
 * date filter. That's how the dashboard's "Total expenses" KPI ended up
 * silently scoped to the last ~10 days (see the API log:
 * `?action=stats&startDate=2026-06-30...&endDate=2026-07-11...`) while
 * the underlying data had records back to April and the UI's "all"
 * filter pill implied no date scoping at all.
 *
 * Now: a dateRange only takes effect when BOTH startDate and endDate are
 * present. A partial or all-undefined range is treated identically to
 * "no range" (all-time), matching what the backend does when it receives
 * no startDate/endDate query params at all. This makes it impossible for
 * an upstream default-state bug to quietly truncate the all-time totals
 * -- callers that want "all time" should now pass `undefined` (not an
 * object with undefined fields), but even if they don't, this hook no
 * longer silently narrows the query.
 */
export function useExpenseStats(dateRange?: { startDate?: Date; endDate?: Date }) {
  const hasCompleteRange = Boolean(dateRange?.startDate && dateRange?.endDate);
  const effectiveRange = hasCompleteRange ? dateRange : undefined;

  const rangeKey = effectiveRange
    ? `${effectiveRange.startDate!.toISOString()}-${effectiveRange.endDate!.toISOString()}`
    : undefined;

  return useQuery({
    queryKey: expenseKeys.stats(rangeKey),
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

/** Powers the Vehicle Expense History page. */
export function useVehicleExpenseHistory(licensePlate: string | undefined, page = 1, limit = 20) {
  return useQuery({
    queryKey: expenseKeys.list({ license_plate: licensePlate, page, limit }),
    queryFn: () => expensesApi.list({ license_plate: licensePlate, page, limit }),
    enabled: Boolean(licensePlate),
    staleTime: 30_000,
  });
}