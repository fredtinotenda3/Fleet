// modules/expenses/services/expense.service.ts

import { BaseService } from '@/server/services/base.service';
import { expenseRepository, ExpenseRepository } from '../repositories/expense.repository';
import { expenseCreateSchema, expenseUpdateSchema, expenseFiltersSchema } from '@/shared/validations/expense.schema';
import { Expense, ExpenseCreateDTO, ExpenseUpdateDTO, ExpenseFilters, ExpenseStats } from '@/shared/types/expense.types';
import { PaginationParams, PaginatedResponse, DateRange } from '@/shared/types/common.types';
import { AppError } from '@/server/errors/app.errors';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';

export class ExpenseService extends BaseService<Expense, ExpenseCreateDTO, ExpenseUpdateDTO> {
  constructor(private expenseRepo: ExpenseRepository) {
    super(expenseRepo);
  }

  protected getCreateSchema() {
    return expenseCreateSchema;
  }

  protected getUpdateSchema() {
    return expenseUpdateSchema;
  }

  protected getEntityName(): string {
    return 'Expense';
  }

  async findByLicensePlate(licensePlate: string, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<Expense>> {
    return this.expenseRepo.findByLicensePlate(licensePlate, tenantId, pagination);
  }

  async getFilteredExpenses(filters: ExpenseFilters, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<Expense>> {
    const validatedFilters = expenseFiltersSchema.parse(filters);
    return this.expenseRepo.getFilteredExpenses(validatedFilters, tenantId, pagination);
  }

  async getExpenseStats(tenantId: string, dateRange?: DateRange): Promise<ExpenseStats> {
    return this.expenseRepo.getExpenseStats(tenantId, dateRange);
  }

  async getMonthlyTrends(tenantId: string, months: number = 12): Promise<Array<{ month: string; total: number }>> {
    return this.expenseRepo.getMonthlyTrends(tenantId, months);
  }

  async getExpenseAnalytics(tenantId: string, startDate: Date, endDate: Date): Promise<any[]> {
    if (startDate > endDate) {
      throw new AppError('Start date must be before end date', 'INVALID_DATE_RANGE', 400);
    }
    return this.expenseRepo.getExpenseAnalytics(tenantId, startDate, endDate);
  }

  async validateVehicleExists(licensePlate: string, tenantId: string): Promise<void> {
    const vehicle = await vehicleRepository.findByLicensePlate(licensePlate, tenantId);
    if (!vehicle) {
      throw new AppError('Vehicle not found', 'VEHICLE_NOT_FOUND', 400);
    }
  }

  async getTotalByCategory(tenantId: string, dateRange?: DateRange): Promise<Record<string, number>> {
    const stats = await this.getExpenseStats(tenantId, dateRange);
    return stats.byType;
  }
}

export const expenseService = new ExpenseService(expenseRepository);