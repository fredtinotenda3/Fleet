// modules/expenses/hooks/useExpenseMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi } from '../api/expenses.api';
import { ExpenseCreateDTO, ExpenseUpdateDTO } from '@/shared/types/expense.types';
import { queryKeys } from '@/shared/config/react-query';
import { toast } from 'sonner';

export const useCreateExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ExpenseCreateDTO) => expensesApi.createExpense(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.stats() });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(variables.license_plate) });
      toast.success('Expense added successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add expense');
    },
  });
};

export const useUpdateExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExpenseUpdateDTO }) =>
      expensesApi.updateExpense(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.stats() });
      toast.success('Expense updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update expense');
    },
  });
};

export const useDeleteExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => expensesApi.deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.stats() });
      toast.success('Expense deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete expense');
    },
  });
};

export const useCreateExpenseType = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; category: string; description?: string }) =>
      expensesApi.createExpenseType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-types'] });
      toast.success('Expense type created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create expense type');
    },
  });
};