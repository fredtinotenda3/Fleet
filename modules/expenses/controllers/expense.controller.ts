// modules/expenses/controllers/expense.controller.ts

import { NextRequest } from 'next/server';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { expenseCommandService } from '../services/expense-command.service';
import { expenseQueryService } from '../services/expense-query.service';
import { ExpenseFilters } from '@/shared/types/expense.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';

bootstrapCqrs();

function parseDateRangeParams(req: NextRequest): { startDate?: Date; endDate?: Date } | undefined {
  const sp = req.nextUrl.searchParams;
  const start = sp.get('startDate');
  const end = sp.get('endDate');
  if (!start && !end) return undefined;
  return {
    startDate: start ? new Date(start) : undefined,
    endDate: end ? new Date(end) : undefined,
  };
}

export class ExpenseController {
  async getExpenses(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: ExpenseFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        type: searchParams.get('type') || undefined,
        startDate: searchParams.get('start')
          ? new Date(searchParams.get('start')!)
          : undefined,
        endDate: searchParams.get('end')
          ? new Date(searchParams.get('end')!)
          : undefined,
        minAmount: searchParams.get('minAmount')
          ? Number(searchParams.get('minAmount'))
          : undefined,
        maxAmount: searchParams.get('maxAmount')
          ? Number(searchParams.get('maxAmount'))
          : undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        const result = await expenseQueryService.getFilteredExpenses(
          filters,
          { page: 1, limit: 10000 },
          tenantId
        );
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(
        pageParam,
        searchParams.get('limit')
      );

      const result = await expenseQueryService.getFilteredExpenses(
        filters,
        { page, limit },
        tenantId
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getExpense(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const expense = await expenseQueryService.getExpenseById(id, tenantId);
      return successResponse(expense);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createExpense(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const expense = await expenseCommandService.createExpense(body, tenantId, userId);
      return createdResponse(expense);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateExpense(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const expense = await expenseCommandService.updateExpense(id, body, tenantId, userId);
      return successResponse(expense);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteExpense(req: NextRequest, id: string) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';

      if (!soft && !authContext.isSuperAdmin) {
        throw new ForbiddenError(
          'Permanently deleting an expense requires organization owner or super admin access. Use a soft delete instead.'
        );
      }

      await expenseCommandService.deleteExpense(id, authContext.tenantId, authContext.userId, soft);
      return successResponse({ message: 'Expense deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async bulkImport(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { records } = await req.json();

      const result = await expenseCommandService.bulkImport(records, tenantId, userId);
      return successResponse({
        message: `Import completed: ${result.inserted} inserted, ${result.errors} errors`,
        results: result,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** Standard-column enterprise import. */
  async importExpenses(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { rows } = await req.json();

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new ValidationError('No rows to import');
      }

      const result = await expenseCommandService.importExpenses(rows, tenantId, userId);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getExpenseStats(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const dateRange =
        searchParams.get('startDate') && searchParams.get('endDate')
          ? {
              startDate: new Date(searchParams.get('startDate')!),
              endDate: new Date(searchParams.get('endDate')!),
            }
          : undefined;

      const stats = await expenseQueryService.getExpenseStats(tenantId, dateRange);
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMonthlyTrends(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const months = Number(req.nextUrl.searchParams.get('months') || '12');

      const trends = await expenseQueryService.getMonthlyTrends(tenantId, months);
      return successResponse(trends);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getExpenseAnalytics(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      if (!searchParams.get('startDate') || !searchParams.get('endDate')) {
        throw new ValidationError('startDate and endDate are required');
      }

      const analytics = await expenseQueryService.getExpenseAnalytics(
        tenantId,
        new Date(searchParams.get('startDate')!),
        new Date(searchParams.get('endDate')!)
      );
      return successResponse(analytics);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getCategoryOverTime(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const data = await expenseQueryService.getExpenseCategoryOverTime(
        tenantId,
        parseDateRangeParams(req)
      );
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTopVehicles(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const limit = Number(req.nextUrl.searchParams.get('limit') || '10');
      const data = await expenseQueryService.getTopVehiclesByExpense(
        tenantId,
        parseDateRangeParams(req),
        limit
      );
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVehicleBreakdown(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const vehicleLimit = Number(req.nextUrl.searchParams.get('vehicleLimit') || '8');
      const data = await expenseQueryService.getVehicleExpenseBreakdown(
        tenantId,
        parseDateRangeParams(req),
        vehicleLimit
      );
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAmountDistribution(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const data = await expenseQueryService.getExpenseAmountDistribution(
        tenantId,
        parseDateRangeParams(req)
      );
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getJobTripExpense(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const jobLimit = Number(req.nextUrl.searchParams.get('jobLimit') || '10');
      const data = await expenseQueryService.getJobTripExpense(
        tenantId,
        parseDateRangeParams(req),
        jobLimit
      );
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ExpenseController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const expenseController = new ExpenseController();