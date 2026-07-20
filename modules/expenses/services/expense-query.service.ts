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
import {
  Expense,
  ExpenseFilters,
  ExpenseStats,
  ExpenseCategoryOverTimePoint,
  TopVehicleExpenseRow,
  VehicleExpenseBreakdownRow,
  ExpenseAmountDistributionBucket,
  JobTripExpenseRow,
} from '@/shared/types/expense.types';
import { PaginatedResponse, PaginationParams, DateRange } from '@/shared/types/common.types';

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
    return queryBus.execute<Expense>(
      new GetExpenseByIdQuery(expenseId, tenantId)
    );
  }

  async getExpenseStats(tenantId: string, dateRange?: DateRange): Promise<ExpenseStats> {
    return queryBus.execute<ExpenseStats>(
      new GetExpenseStatsQuery(tenantId, dateRange)
    );
  }

  async getMonthlyTrends(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; total: number }>> {
    return queryBus.execute<Array<{ month: string; total: number }>>(
      new GetMonthlyTrendsQuery(tenantId, months)
    );
  }

  async getExpenseAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<unknown[]> {
    return queryBus.execute<unknown[]>(
      new GetExpenseAnalyticsQuery(tenantId, startDate, endDate)
    );
  }

  async getExpenseCategoryOverTime(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<ExpenseCategoryOverTimePoint[]> {
    return queryBus.execute<ExpenseCategoryOverTimePoint[]>(
      new GetExpenseCategoryOverTimeQuery(tenantId, dateRange)
    );
  }

  async getTopVehiclesByExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10
  ): Promise<TopVehicleExpenseRow[]> {
    return queryBus.execute<TopVehicleExpenseRow[]>(
      new GetTopVehiclesByExpenseQuery(tenantId, dateRange, limit)
    );
  }

  async getVehicleExpenseBreakdown(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    vehicleLimit: number = 8
  ): Promise<VehicleExpenseBreakdownRow[]> {
    return queryBus.execute<VehicleExpenseBreakdownRow[]>(
      new GetVehicleExpenseBreakdownQuery(tenantId, dateRange, vehicleLimit)
    );
  }

  async getExpenseAmountDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<ExpenseAmountDistributionBucket[]> {
    return queryBus.execute<ExpenseAmountDistributionBucket[]>(
      new GetExpenseAmountDistributionQuery(tenantId, dateRange)
    );
  }

  async getJobTripExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    jobLimit: number = 10
  ): Promise<JobTripExpenseRow[]> {
    return queryBus.execute<JobTripExpenseRow[]>(
      new GetJobTripExpenseQuery(tenantId, dateRange, jobLimit)
    );
  }
}

export const expenseQueryService = new ExpenseQueryService();