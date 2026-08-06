// modules/expenses/services/expense-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetExpensesQuery } from '../queries/get-expenses.query';
import { GetExpenseByIdQuery } from '../queries/get-expense-by-id.query';
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
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { expenseRepository } from '../repositories/expense.repository';

// FIX (Phase B -- repository/analytics scoping completeness): same
// change as FuelQueryService -- the 12 analytics methods below used to
// route through queryBus -> Query class -> Handler, none of which carried
// `context`. Threading org-unit scoping through ~24 additional files
// (12 query classes + 12 handlers, all pure passthroughs with no
// business logic beyond a repository call) is disproportionate; these
// now call the (already org-unit-scoped) repository directly. CRUD/list
// methods (getFilteredExpenses, getExpenseById) are unchanged and still
// routed through the CQRS bus.
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

  async getExpenseStats(
    tenantId: string,
    dateRange?: DateRange,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<ExpenseStats> {
    return expenseRepository.getExpenseStats(tenantId, dateRange, scope, context);
  }

  async getMonthlyTrends(
    tenantId: string,
    months: number = 12,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<Array<{ month: string; total: number }>> {
    return expenseRepository.getMonthlyTrends(tenantId, months, scope, context);
  }

  async getExpenseAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    context?: TenantContext
  ): Promise<unknown[]> {
    return expenseRepository.getExpenseAnalytics(tenantId, startDate, endDate, context);
  }

  async getExpenseCategoryOverTime(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<ExpenseCategoryOverTimePoint[]> {
    return expenseRepository.getExpenseCategoryOverTime(tenantId, dateRange, scope, context);
  }

  async getTopVehiclesByExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<TopVehicleExpenseRow[]> {
    return expenseRepository.getTopVehiclesByExpense(tenantId, dateRange, limit, scope, context);
  }

  async getVehicleExpenseBreakdown(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    vehicleLimit: number = 8,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<VehicleExpenseBreakdownRow[]> {
    return expenseRepository.getVehicleExpenseBreakdown(tenantId, dateRange, vehicleLimit, scope, context);
  }

  async getExpenseAmountDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<ExpenseAmountDistributionBucket[]> {
    return expenseRepository.getExpenseAmountDistribution(tenantId, dateRange, scope, context);
  }

  async getJobTripExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    jobLimit: number = 10,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<JobTripExpenseRow[]> {
    return expenseRepository.getJobTripExpenseAnalysis(tenantId, dateRange, jobLimit, scope, context);
  }

  async getExpenseCategorySummary(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<CategorySummary[]> {
    return expenseRepository.getExpenseCategorySummary(tenantId, dateRange, scope, context);
  }

  async getTopExpenseTransactions(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<TopExpenseTransactionRow[]> {
    return expenseRepository.getTopExpenseTransactions(tenantId, dateRange, limit, scope, context);
  }

  async getDailyExpenseTotals(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<DailyExpenseTotal[]> {
    return expenseRepository.getDailyExpenseTotals(tenantId, dateRange, scope, context);
  }

  async getExpenseOutliers(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 25,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<ExpenseOutlierRow[]> {
    return expenseRepository.getExpenseOutliers(tenantId, dateRange, zThreshold, limit, scope, context);
  }
}

export const expenseQueryService = new ExpenseQueryService();