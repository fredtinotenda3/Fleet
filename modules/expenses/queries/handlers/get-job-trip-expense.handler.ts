//modules/expenses/queries/handlers/get-job-trip-expense.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetJobTripExpenseQuery } from '../get-job-trip-expense.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { JobTripExpenseRow } from '@/shared/types/expense.types';

export class GetJobTripExpenseHandler
  implements IQueryHandler<GetJobTripExpenseQuery, JobTripExpenseRow[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetJobTripExpenseQuery): Promise<JobTripExpenseRow[]> {
    return this.expenseRepo.getJobTripExpenseAnalysis(query.tenantId, query.dateRange, query.jobLimit);
  }
}