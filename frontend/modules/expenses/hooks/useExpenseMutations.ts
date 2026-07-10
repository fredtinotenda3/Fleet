
// frontend/modules/expenses/hooks/useExpenseMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { expensesApi } from '../services/expenses.api';
import { expenseKeys } from './useExpenses';
import type { ExpenseFormOutput } from '../schemas';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpenseFormOutput) => expensesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      toast.success('Expense recorded');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to record expense')),
  });
}

export function useUpdateExpense(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<ExpenseFormOutput>) => expensesApi.update(id, payload),
    onSuccess: (expense) => {
      queryClient.setQueryData(expenseKeys.detail(id), expense);
      queryClient.invalidateQueries({ queryKey: expenseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      toast.success('Expense updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update expense')),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, soft = true }: { id: string; soft?: boolean }) => expensesApi.remove(id, soft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      toast.success('Expense deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete expense')),
  });
}

export function useBulkDeleteExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => expensesApi.remove(id, true)));
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      toast.success(`${ids.length} expense${ids.length === 1 ? '' : 's'} deleted`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete selected expenses')),
  });
}

export function useBulkImportExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (records: Array<Record<string, unknown>>) => expensesApi.bulkImport(records),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      toast.success(result.message);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to import expenses')),
  });
}

export function useCreateExpenseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; category: string; description?: string }) =>
      expensesApi.createExpenseType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.types() });
      toast.success('Expense category created');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to create expense category')),
  });
}