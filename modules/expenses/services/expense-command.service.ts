// modules/expenses/services/expense-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateExpenseCommand } from '../commands/create-expense.command';
import { UpdateExpenseCommand } from '../commands/update-expense.command';
import { DeleteExpenseCommand } from '../commands/delete-expense.command';
import {
  BulkImportExpensesCommand,
  BulkExpenseRecord,
} from '../commands/bulk-import-expenses.command';
import { Expense } from '@/shared/types/expense.types';
import type { BulkImportResult } from '../commands/handlers/bulk-import-expenses.handler';

export class ExpenseCommandService {
  async createExpense(
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Expense> {
    return commandBus.execute<Expense>(
      new CreateExpenseCommand(rawData, tenantId, userId)
    );
  }

  async updateExpense(
    expenseId: string,
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Expense> {
    return commandBus.execute<Expense>(
      new UpdateExpenseCommand(expenseId, rawData, tenantId, userId)
    );
  }

  async deleteExpense(
    expenseId: string,
    tenantId: string,
    userId?: string,
    soft: boolean = true
  ): Promise<void> {
    return commandBus.execute<void>(
      new DeleteExpenseCommand(expenseId, tenantId, userId, soft)
    );
  }

  async bulkImport(
    records: BulkExpenseRecord[],
    tenantId: string,
    userId?: string
  ): Promise<BulkImportResult> {
    return commandBus.execute<BulkImportResult>(
      new BulkImportExpensesCommand(records, tenantId, userId)
    );
  }
}

export const expenseCommandService = new ExpenseCommandService();