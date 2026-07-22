// frontend/modules/expenses/services/expenses.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { ExportFormat } from '@/shared/export/export.types';
import type { ExportBlobResponse } from '@/shared/utils/export-download.utils';
import type { Expense, ExpenseType, ExpenseTableFilters, ExpenseStats } from '../types';
import type { ExpenseFormOutput } from '../schemas';
import type {
  ExpenseCategoryOverTimePoint,
  TopVehicleExpenseRow,
  VehicleExpenseBreakdownRow,
  ExpenseAmountDistributionBucket,
  JobTripExpenseRow,
  CategorySummary,
  TopExpenseTransactionRow,
  DailyExpenseTotal,
  ExpenseOutlierRow,
} from '@/shared/types/expense.types';
import type { ImportResponse } from '@/frontend/shared/import/ImportModal';

const BASE = '/api/expenses';

export interface ExpenseListParams extends ExpenseTableFilters {
  page?: number;
  limit?: number;
}

export interface BulkImportResult {
  message: string;
  results: { inserted: number; errors: number; errorDetails: string[] };
}

type DateRange = { startDate?: Date; endDate?: Date } | undefined;

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function buildListQuery(params: Partial<ExpenseListParams>) {
  return {
    license_plate: params.license_plate,
    type: params.type,
    jobTrip: (params as any).jobTrip,
    start: toIso(params.startDate),
    end: toIso(params.endDate),
    minAmount: params.minAmount,
    maxAmount: params.maxAmount,
    page: params.page,
    limit: params.limit,
  };
}

function rangeParams(dateRange?: DateRange) {
  return {
    startDate: dateRange?.startDate ? dateRange.startDate.toISOString() : undefined,
    endDate: dateRange?.endDate ? dateRange.endDate.toISOString() : undefined,
  };
}

export const expensesApi = {
  async list(params: Partial<ExpenseListParams> = {}): Promise<PaginatedResponse<Expense>> {
    return apiClient.get<PaginatedResponse<Expense>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<Expense> {
    return apiClient.get<Expense>(BASE, { params: { id } });
  },

  async getStats(dateRange?: DateRange): Promise<ExpenseStats> {
    const params: Record<string, string | undefined> = { action: 'stats' };
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<ExpenseStats>(BASE, { params });
  },

  async getMonthlyTrends(months: number = 12): Promise<Array<{ month: string; total: number }>> {
    return apiClient.get<Array<{ month: string; total: number }>>(BASE, { params: { action: 'monthly', months } });
  },

  async getCategoryOverTime(dateRange?: DateRange): Promise<ExpenseCategoryOverTimePoint[]> {
    return apiClient.get<ExpenseCategoryOverTimePoint[]>(BASE, {
      params: { action: 'category-over-time', ...rangeParams(dateRange) },
    });
  },

  async getTopVehicles(dateRange?: DateRange, limit: number = 10): Promise<TopVehicleExpenseRow[]> {
    return apiClient.get<TopVehicleExpenseRow[]>(BASE, {
      params: { action: 'top-vehicles', limit, ...rangeParams(dateRange) },
    });
  },

  async getVehicleBreakdown(dateRange?: DateRange, vehicleLimit: number = 8): Promise<VehicleExpenseBreakdownRow[]> {
    return apiClient.get<VehicleExpenseBreakdownRow[]>(BASE, {
      params: { action: 'vehicle-breakdown', vehicleLimit, ...rangeParams(dateRange) },
    });
  },

  async getAmountDistribution(dateRange?: DateRange): Promise<ExpenseAmountDistributionBucket[]> {
    return apiClient.get<ExpenseAmountDistributionBucket[]>(BASE, {
      params: { action: 'amount-distribution', ...rangeParams(dateRange) },
    });
  },

  async getJobTripExpense(dateRange?: DateRange, jobLimit: number = 10): Promise<JobTripExpenseRow[]> {
    return apiClient.get<JobTripExpenseRow[]>(BASE, {
      params: { action: 'job-trip', jobLimit, ...rangeParams(dateRange) },
    });
  },

  async getCategorySummary(dateRange?: DateRange): Promise<CategorySummary[]> {
    return apiClient.get<CategorySummary[]>(BASE, {
      params: { action: 'category-summary', ...rangeParams(dateRange) },
    });
  },

  async getTopTransactions(dateRange?: DateRange, limit: number = 10): Promise<TopExpenseTransactionRow[]> {
    return apiClient.get<TopExpenseTransactionRow[]>(BASE, {
      params: { action: 'top-transactions', limit, ...rangeParams(dateRange) },
    });
  },

  async getDailyTotals(dateRange?: DateRange): Promise<DailyExpenseTotal[]> {
    return apiClient.get<DailyExpenseTotal[]>(BASE, {
      params: { action: 'daily-totals', ...rangeParams(dateRange) },
    });
  },

  async getOutliers(dateRange?: DateRange, zThreshold: number = 2.5, limit: number = 25): Promise<ExpenseOutlierRow[]> {
    return apiClient.get<ExpenseOutlierRow[]>(BASE, {
      params: { action: 'outliers', zThreshold, limit, ...rangeParams(dateRange) },
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

  /**
   * Enterprise Export Framework (Phase 2). Expense export lives behind
   * ?action=export on the shared /api/expenses route. Sends the same
   * filter fields as list() (including the jobTrip filter, which isn't
   * part of ExpenseTableFilters but is read straight through by both
   * the list and export controllers) so the backend re-queries the full
   * authorized, filtered result set (capped at EXPORT_ROW_CAP).
   */
  async exportFile(
    filters: Partial<ExpenseTableFilters> & { jobTrip?: string },
    format: ExportFormat = 'csv'
  ): Promise<ExportBlobResponse> {
    return apiClient.getBlob(BASE, {
      params: {
        action: 'export',
        license_plate: filters.license_plate,
        type: filters.type,
        jobTrip: filters.jobTrip,
        start: toIso(filters.startDate),
        end: toIso(filters.endDate),
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
        format,
      },
    });
  },

  async bulkImport(records: Array<Record<string, unknown>>): Promise<BulkImportResult> {
    return apiClient.post<BulkImportResult>(`${BASE}/bulk`, { records });
  },

  async importStandard(rows: Array<Record<string, unknown>>): Promise<ImportResponse> {
    return apiClient.post<ImportResponse>(`${BASE}/import`, { rows });
  },

  async getExpenseTypes(grouped: boolean = false): Promise<ExpenseType[]> {
    return apiClient.get<ExpenseType[]>('/api/expense-types', { params: { grouped } });
  },

  async createExpenseType(data: { name: string; category: string; description?: string }): Promise<ExpenseType> {
    return apiClient.post<ExpenseType>('/api/expense-types', data);
  },
};

export default expensesApi;