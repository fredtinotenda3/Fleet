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

/**
 * Vehicle-Level Analytics: every analytics call accepts an optional
 * `licensePlate`, mirroring fuelApi.ts's scopeParams. Omit it for
 * today's unscoped fleet-wide behaviour.
 */
function scopeParams(licensePlate?: string) {
  return licensePlate ? { license_plate: licensePlate } : {};
}

export const expensesApi = {
  async list(params: Partial<ExpenseListParams> = {}): Promise<PaginatedResponse<Expense>> {
    return apiClient.get<PaginatedResponse<Expense>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<Expense> {
    return apiClient.get<Expense>(BASE, { params: { id } });
  },

  async getStats(dateRange?: DateRange, licensePlate?: string): Promise<ExpenseStats> {
    const params: Record<string, string | undefined> = { action: 'stats' };
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<ExpenseStats>(BASE, { params: { ...params, ...scopeParams(licensePlate) } });
  },

  async getMonthlyTrends(months: number = 12, licensePlate?: string): Promise<Array<{ month: string; total: number }>> {
    return apiClient.get<Array<{ month: string; total: number }>>(BASE, {
      params: { action: 'monthly', months, ...scopeParams(licensePlate) },
    });
  },

  async getCategoryOverTime(dateRange?: DateRange, licensePlate?: string): Promise<ExpenseCategoryOverTimePoint[]> {
    return apiClient.get<ExpenseCategoryOverTimePoint[]>(BASE, {
      params: { action: 'category-over-time', ...rangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getTopVehicles(dateRange?: DateRange, limit: number = 10, licensePlate?: string): Promise<TopVehicleExpenseRow[]> {
    return apiClient.get<TopVehicleExpenseRow[]>(BASE, {
      params: { action: 'top-vehicles', limit, ...rangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getVehicleBreakdown(
    dateRange?: DateRange,
    vehicleLimit: number = 8,
    licensePlate?: string
  ): Promise<VehicleExpenseBreakdownRow[]> {
    return apiClient.get<VehicleExpenseBreakdownRow[]>(BASE, {
      params: { action: 'vehicle-breakdown', vehicleLimit, ...rangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getAmountDistribution(dateRange?: DateRange, licensePlate?: string): Promise<ExpenseAmountDistributionBucket[]> {
    return apiClient.get<ExpenseAmountDistributionBucket[]>(BASE, {
      params: { action: 'amount-distribution', ...rangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getJobTripExpense(dateRange?: DateRange, jobLimit: number = 10, licensePlate?: string): Promise<JobTripExpenseRow[]> {
    return apiClient.get<JobTripExpenseRow[]>(BASE, {
      params: { action: 'job-trip', jobLimit, ...rangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getCategorySummary(dateRange?: DateRange, licensePlate?: string): Promise<CategorySummary[]> {
    return apiClient.get<CategorySummary[]>(BASE, {
      params: { action: 'category-summary', ...rangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getTopTransactions(dateRange?: DateRange, limit: number = 10, licensePlate?: string): Promise<TopExpenseTransactionRow[]> {
    return apiClient.get<TopExpenseTransactionRow[]>(BASE, {
      params: { action: 'top-transactions', limit, ...rangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getDailyTotals(dateRange?: DateRange, licensePlate?: string): Promise<DailyExpenseTotal[]> {
    return apiClient.get<DailyExpenseTotal[]>(BASE, {
      params: { action: 'daily-totals', ...rangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getOutliers(
    dateRange?: DateRange,
    zThreshold: number = 2.5,
    limit: number = 25,
    licensePlate?: string
  ): Promise<ExpenseOutlierRow[]> {
    return apiClient.get<ExpenseOutlierRow[]>(BASE, {
      params: { action: 'outliers', zThreshold, limit, ...rangeParams(dateRange), ...scopeParams(licensePlate) },
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