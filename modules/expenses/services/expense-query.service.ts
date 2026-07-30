// modules/expenses/services/expense-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetExpensesQuery } from '../queries/get-expenses.query';
import { GetExpenseByIdQuery } from '../queries/get-expense-by-id.query';
import { GetExpenseStatsQuery } from '../queries/get-expense-stats.query';
import { GetMonthlyTrendsQuery } from '../queries/get-monthly-trends.query';
import { GetExpenseAnalyticsQuery } from '../queries/get-expense-analytics.query';
import { GetExpenseCategoryOverTimeQuery } from '../queries/get-expense-category-over-time.query';
import { GetTopVehiclesByExpenseQuery } from '../queries/get-top-vehicles-by-expense.query';
import { GetVehicleExpenseBreakdownQuery } from '../queries/get-vehicle-expense-breakdown.query';
import { GetExpenseAmountDistributionQuery } from '../queries/get-expense-amount-distribution.query';
import { GetJobTripExpenseQuery } from '../queries/get-job-trip-expense.query';
import { GetExpenseCategorySummaryQuery } from '../queries/get-expense-category-summary.query';
import { GetTopExpenseTransactionsQuery } from '../queries/get-top-expense-transactions.query';
import { GetDailyExpenseTotalsQuery } from '../queries/get-daily-expense-totals.query';
import { GetExpenseOutliersQuery } from '../queries/get-expense-outliers.query';
import {
  Expense,
  ExpenseFilters,
  ExpenseStats,
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
import { PaginatedResponse, PaginationParams, DateRange } from '@/shared/types/common.types';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class ExpenseQueryService {
  async getFilteredExpenses(
    filters: ExpenseFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Expense>> {
    return queryBus.execute<PaginatedResponse<Expense>>(
      new GetExpensesQuery(filters, pagination, tenantId)
    );
  }

  async getExpenseById(expenseId: string, tenantId: string): Promise<Expense> {
    return queryBus.execute<Expense>(new GetExpenseByIdQuery(expenseId, tenantId));
  }

  async getExpenseStats(tenantId: string, dateRange?: DateRange, scope?: AnalyticsScope): Promise<ExpenseStats> {
    return queryBus.execute<ExpenseStats>(new GetExpenseStatsQuery(tenantId, dateRange, scope));
  }

  async getMonthlyTrends(
    tenantId: string,
    months: number = 12,
    scope?: AnalyticsScope
  ): Promise<Array<{ month: string; total: number }>> {
    return queryBus.execute<Array<{ month: string; total: number }>>(
      new GetMonthlyTrendsQuery(tenantId, months, scope)
    );
  }

  async getExpenseAnalytics(tenantId: string, startDate: Date, endDate: Date): Promise<unknown[]> {
    return queryBus.execute<unknown[]>(new GetExpenseAnalyticsQuery(tenantId, startDate, endDate));
  }

  async getExpenseCategoryOverTime(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope
  ): Promise<ExpenseCategoryOverTimePoint[]> {
    return queryBus.execute<ExpenseCategoryOverTimePoint[]>(
      new GetExpenseCategoryOverTimeQuery(tenantId, dateRange, scope)
    );
  }

  async getTopVehiclesByExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    scope?: AnalyticsScope
  ): Promise<TopVehicleExpenseRow[]> {
    return queryBus.execute<TopVehicleExpenseRow[]>(
      new GetTopVehiclesByExpenseQuery(tenantId, dateRange, limit, scope)
    );
  }

  async getVehicleExpenseBreakdown(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    vehicleLimit: number = 8,
    scope?: AnalyticsScope
  ): Promise<VehicleExpenseBreakdownRow[]> {
    return queryBus.execute<VehicleExpenseBreakdownRow[]>(
      new GetVehicleExpenseBreakdownQuery(tenantId, dateRange, vehicleLimit, scope)
    );
  }

  async getExpenseAmountDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope
  ): Promise<ExpenseAmountDistributionBucket[]> {
    return queryBus.execute<ExpenseAmountDistributionBucket[]>(
      new GetExpenseAmountDistributionQuery(tenantId, dateRange, scope)
    );
  }

  async getJobTripExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    jobLimit: number = 10,
    scope?: AnalyticsScope
  ): Promise<JobTripExpenseRow[]> {
    return queryBus.execute<JobTripExpenseRow[]>(
      new GetJobTripExpenseQuery(tenantId, dateRange, jobLimit, scope)
    );
  }

  async getExpenseCategorySummary(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope
  ): Promise<CategorySummary[]> {
    return queryBus.execute<CategorySummary[]>(
      new GetExpenseCategorySummaryQuery(tenantId, dateRange, scope)
    );
  }

  async getTopExpenseTransactions(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    scope?: AnalyticsScope
  ): Promise<TopExpenseTransactionRow[]> {
    return queryBus.execute<TopExpenseTransactionRow[]>(
      new GetTopExpenseTransactionsQuery(tenantId, dateRange, limit, scope)
    );
  }

  async getDailyExpenseTotals(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope
  ): Promise<DailyExpenseTotal[]> {
    return queryBus.execute<DailyExpenseTotal[]>(
      new GetDailyExpenseTotalsQuery(tenantId, dateRange, scope)
    );
  }

  async getExpenseOutliers(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 25,
    scope?: AnalyticsScope
  ): Promise<ExpenseOutlierRow[]> {
    return queryBus.execute<ExpenseOutlierRow[]>(
      new GetExpenseOutliersQuery(tenantId, dateRange, zThreshold, limit, scope)
    );
  }
}

export const expenseQueryService = new ExpenseQueryService();