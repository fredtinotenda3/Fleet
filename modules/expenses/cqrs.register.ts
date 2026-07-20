// modules/expenses/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { expenseRepository } from './repositories/expense.repository';

import { CreateExpenseCommand } from './commands/create-expense.command';
import { UpdateExpenseCommand } from './commands/update-expense.command';
import { DeleteExpenseCommand } from './commands/delete-expense.command';
import { BulkImportExpensesCommand } from './commands/bulk-import-expenses.command';
import { ImportExpensesCommand } from './commands/import-expenses.command';

import { CreateExpenseHandler } from './commands/handlers/create-expense.handler';
import { UpdateExpenseHandler } from './commands/handlers/update-expense.handler';
import { DeleteExpenseHandler } from './commands/handlers/delete-expense.handler';
import { BulkImportExpensesHandler } from './commands/handlers/bulk-import-expenses.handler';
import { ImportExpensesHandler } from './commands/handlers/import-expenses.handler';

import { GetExpensesQuery } from './queries/get-expenses.query';
import { GetExpenseByIdQuery } from './queries/get-expense-by-id.query';
import { GetExpenseStatsQuery } from './queries/get-expense-stats.query';
import { GetMonthlyTrendsQuery } from './queries/get-monthly-trends.query';
import { GetExpenseAnalyticsQuery } from './queries/get-expense-analytics.query';
import { GetExpenseCategoryOverTimeQuery } from './queries/get-expense-category-over-time.query';
import { GetTopVehiclesByExpenseQuery } from './queries/get-top-vehicles-by-expense.query';
import { GetVehicleExpenseBreakdownQuery } from './queries/get-vehicle-expense-breakdown.query';
import { GetExpenseAmountDistributionQuery } from './queries/get-expense-amount-distribution.query';
import { GetJobTripExpenseQuery } from './queries/get-job-trip-expense.query';

import { GetExpensesHandler } from './queries/handlers/get-expenses.handler';
import { GetExpenseByIdHandler } from './queries/handlers/get-expense-by-id.handler';
import { GetExpenseStatsHandler } from './queries/handlers/get-expense-stats.handler';
import { GetMonthlyTrendsHandler } from './queries/handlers/get-monthly-trends.handler';
import { GetExpenseAnalyticsHandler } from './queries/handlers/get-expense-analytics.handler';
import { GetExpenseCategoryOverTimeHandler } from './queries/handlers/get-expense-category-over-time.handler';
import { GetTopVehiclesByExpenseHandler } from './queries/handlers/get-top-vehicles-by-expense.handler';
import { GetVehicleExpenseBreakdownHandler } from './queries/handlers/get-vehicle-expense-breakdown.handler';
import { GetExpenseAmountDistributionHandler } from './queries/handlers/get-expense-amount-distribution.handler';
import { GetJobTripExpenseHandler } from './queries/handlers/get-job-trip-expense.handler';

export function registerExpenseCqrsHandlers(
  commandBus: CommandBus,
  queryBus: QueryBus
): void {
  // Commands
  commandBus.register(CreateExpenseCommand, new CreateExpenseHandler(expenseRepository));
  commandBus.register(UpdateExpenseCommand, new UpdateExpenseHandler(expenseRepository));
  commandBus.register(DeleteExpenseCommand, new DeleteExpenseHandler(expenseRepository));
  commandBus.register(BulkImportExpensesCommand, new BulkImportExpensesHandler(expenseRepository));
  commandBus.register(ImportExpensesCommand, new ImportExpensesHandler(expenseRepository));

  // Queries
  queryBus.register(GetExpensesQuery, new GetExpensesHandler(expenseRepository));
  queryBus.register(GetExpenseByIdQuery, new GetExpenseByIdHandler(expenseRepository));
  queryBus.register(GetExpenseStatsQuery, new GetExpenseStatsHandler(expenseRepository));
  queryBus.register(GetMonthlyTrendsQuery, new GetMonthlyTrendsHandler(expenseRepository));
  queryBus.register(GetExpenseAnalyticsQuery, new GetExpenseAnalyticsHandler(expenseRepository));
  queryBus.register(GetExpenseCategoryOverTimeQuery, new GetExpenseCategoryOverTimeHandler(expenseRepository));
  queryBus.register(GetTopVehiclesByExpenseQuery, new GetTopVehiclesByExpenseHandler(expenseRepository));
  queryBus.register(GetVehicleExpenseBreakdownQuery, new GetVehicleExpenseBreakdownHandler(expenseRepository));
  queryBus.register(GetExpenseAmountDistributionQuery, new GetExpenseAmountDistributionHandler(expenseRepository));
  queryBus.register(GetJobTripExpenseQuery, new GetJobTripExpenseHandler(expenseRepository));
}