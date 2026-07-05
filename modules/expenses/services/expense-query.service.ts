// modules/expenses/services/expense-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetExpensesQuery } from '../queries/get-expenses.query';
import { GetExpenseByIdQuery } from '../queries/get-expense-by-id.query';
import { GetExpenseStatsQuery } from '../queries/get-expense-stats.query';
import { GetMonthlyTrendsQuery } from '../queries/get-monthly-trends.query';
import { GetExpenseAnalyticsQuery } from '../queries/get-expense-analytics.query';
import { Expense, ExpenseFilters, ExpenseStats } from '@/shared/types/expense.types';
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
}

export const expenseQueryService = new ExpenseQueryService();