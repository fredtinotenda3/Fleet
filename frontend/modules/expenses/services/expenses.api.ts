
// frontend/modules/expenses/services/expenses.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { Expense, ExpenseType, ExpenseTableFilters, ExpenseStats } from '../types';
import type { ExpenseFormOutput } from '../schemas';

const BASE = '/api/expenses';

export interface ExpenseListParams extends ExpenseTableFilters {
  page?: number;
  limit?: number;
}

export interface BulkImportResult {
  message: string;
  results: {
    inserted: number;
    errors: number;
    errorDetails: string[];
  };
}

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function buildListQuery(params: Partial<ExpenseListParams>) {
  return {
    license_plate: params.license_plate,
    type: params.type,
    start: toIso(params.startDate),
    end: toIso(params.endDate),
    minAmount: params.minAmount,
    maxAmount: params.maxAmount,
    page: params.page,
    limit: params.limit,
  };
}

export const expensesApi = {
  async list(params: Partial<ExpenseListParams> = {}): Promise<PaginatedResponse<Expense>> {
    return apiClient.get<PaginatedResponse<Expense>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<Expense> {
    return apiClient.get<Expense>(BASE, { params: { id } });
  },

  async getStats(dateRange?: { startDate?: Date; endDate?: Date }): Promise<ExpenseStats> {
    const params: Record<string, string | undefined> = { action: 'stats' };
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<ExpenseStats>(BASE, { params });
  },

  async getMonthlyTrends(months: number = 12): Promise<Array<{ month: string; total: number }>> {
    return apiClient.get<Array<{ month: string; total: number }>>(BASE, {
      params: { action: 'monthly', months },
    });
  },

  async getAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ _id: { category?: string; month: string }; total: number }>> {
    return apiClient.get(BASE, {
      params: { action: 'analytics', startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  },

  async create(payload: ExpenseFormOutput): Promise<Expense> {
    return apiClient.post<Expense>(BASE, payload);
  },

  async update(id: string, payload: Partial<ExpenseFormOutput>): Promise<Expense> {
    return apiClient.put<Expense>(BASE, payload, { params: { id } });
  },

  async remove(id: string, soft: boolean = true): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(BASE, { params: { id, soft } });
  },

  async bulkImport(records: Array<Record<string, unknown>>): Promise<BulkImportResult> {
    return apiClient.post<BulkImportResult>(`${BASE}/bulk`, { records });
  },

  async getExpenseTypes(grouped: boolean = false): Promise<ExpenseType[]> {
    return apiClient.get<ExpenseType[]>('/api/expense-types', { params: { grouped } });
  },

  async createExpenseType(data: { name: string; category: string; description?: string }): Promise<ExpenseType> {
    return apiClient.post<ExpenseType>('/api/expense-types', data);
  },
};

export default expensesApi;