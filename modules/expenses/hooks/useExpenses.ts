// modules/expenses/hooks/useExpenses.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi } from '../api/expenses.api';
import { Expense, ExpenseFilters, ExpenseStats } from '@/shared/types/expense.types';
import { PaginatedResponse } from '@/shared/types/common.types';
import { queryKeys } from '@/shared/config/react-query';
import { DateRange } from '@/shared/types/common.types';

export const useExpenses = (
  filters: ExpenseFilters = {},
  page: number = 1,
  limit: number = 10
) => {
  return useQuery({
    queryKey: queryKeys.expenses.list({ filters, page, limit }),
    queryFn: () => expensesApi.getExpenses(filters, page, limit),
  });
};

export const useExpenseStats = (dateRange?: DateRange) => {
  return useQuery({
    queryKey: [...queryKeys.expenses.stats(), dateRange],
    queryFn: () => expensesApi.getExpenseStats(dateRange),
  });
};

export const useMonthlyTrends = (months: number = 12) => {
  return useQuery({
    queryKey: [...queryKeys.expenses.lists(), 'trends', months],
    queryFn: () => expensesApi.getMonthlyTrends(months),
  });
};

export const useExpenseAnalytics = (startDate: Date, endDate: Date) => {
  return useQuery({
    queryKey: [...queryKeys.expenses.lists(), 'analytics', startDate, endDate],
    queryFn: () => expensesApi.getExpenseAnalytics(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
};

export const useExpenseTypes = () => {
  return useQuery({
    queryKey: ['expense-types'],
    queryFn: () => expensesApi.getExpenseTypes(),
  });
};