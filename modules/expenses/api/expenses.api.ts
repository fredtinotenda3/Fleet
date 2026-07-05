// modules/expenses/api/expenses.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import {
  Expense,
  ExpenseCreateDTO,
  ExpenseUpdateDTO,
  ExpenseFilters,
  ExpenseStats,
} from '@/shared/types/expense.types';
import { PaginatedResponse, DateRange } from '@/shared/types/common.types';

const BASE_URL = '/expenses';

export const expensesApi = {
  async getExpenses(
    filters: ExpenseFilters = {},
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedResponse<Expense>> {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit,
      ...(filters.license_plate && {
        license_plate: filters.license_plate,
      }),
      ...(filters.type && { type: filters.type }),
      ...(filters.startDate && {
        startDate: filters.startDate.toISOString(),
      }),
      ...(filters.endDate && { endDate: filters.endDate.toISOString() }),
      ...(filters.minAmount !== undefined && {
        minAmount: filters.minAmount,
      }),
      ...(filters.maxAmount !== undefined && {
        maxAmount: filters.maxAmount,
      }),
    };

    return apiClient.get<PaginatedResponse<Expense>>(BASE_URL, { params });
  },

  async getExpenseById(id: string): Promise<Expense> {
    return apiClient.get<Expense>(BASE_URL, { params: { id } });
  },

  async getExpenseStats(dateRange?: DateRange): Promise<ExpenseStats> {
    const params: Record<string, string | undefined> = {};
    if (dateRange?.startDate)
      params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate)
      params.endDate = dateRange.endDate.toISOString();

    return apiClient.get<ExpenseStats>(BASE_URL, {
      params: { action: 'stats', ...params },
    });
  },

  async getMonthlyTrends(
    months: number = 12
  ): Promise<Array<{ month: string; total: number }>> {
    return apiClient.get<Array<{ month: string; total: number }>>(
      BASE_URL,
      { params: { action: 'monthly', months } }
    );
  },

  async getExpenseAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    return apiClient.get<any[]>(BASE_URL, {
      params: {
        action: 'analytics',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  },

  async getExpenseTypes(): Promise<Array<{ _id: string; name: string; category: string }>> {
    return apiClient.get<Array<{ _id: string; name: string; category: string }>>(
      '/expense-types'
    );
  },

  async createExpense(data: ExpenseCreateDTO): Promise<Expense> {
    return apiClient.post<Expense>(BASE_URL, data);
  },

  async updateExpense(
    id: string,
    data: ExpenseUpdateDTO
  ): Promise<Expense> {
    return apiClient.put<Expense>(BASE_URL, data, { params: { id } });
  },

  async deleteExpense(id: string): Promise<void> {
    await apiClient.delete<void>(BASE_URL, { params: { id } });
  },

  async createExpenseType(data: {
    name: string;
    category: string;
    description?: string;
  }): Promise<{ _id: string; name: string }> {
    return apiClient.post<{ _id: string; name: string }>(
      '/expense-types',
      data
    );
  },
};

export default expensesApi;