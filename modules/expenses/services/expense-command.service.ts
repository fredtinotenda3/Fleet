// modules/expenses/services/expense-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateExpenseCommand } from '../commands/create-expense.command';
import { UpdateExpenseCommand } from '../commands/update-expense.command';
import { DeleteExpenseCommand } from '../commands/delete-expense.command';
import {
  BulkImportExpensesCommand,
  BulkExpenseRecord,
} from '../commands/bulk-import-expenses.command';
import { ImportExpensesCommand, ImportExpenseRow } from '../commands/import-expenses.command';
import { Expense } from '@/shared/types/expense.types';
import type { BulkImportResult } from '../commands/handlers/bulk-import-expenses.handler';
import type { ImportExpensesResult } from '../commands/handlers/import-expenses.handler';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';

export class ExpenseCommandService {
  /**
   * `scope` replaces the former `tenantId` parameter (the tenant is
   * derivable from it) so a caller cannot pass a tenantId that
   * contradicts the scope.
   */
  async createExpense(
    rawData: unknown,
    scope: WriteScope,
    userId?: string
  ): Promise<Expense> {
    return commandBus.execute<Expense>(
      new CreateExpenseCommand(rawData, tenantIdOf(scope), scope, userId)
    );
  }

  async updateExpense(
    expenseId: string,
    rawData: unknown,
    scope: WriteScope,
    userId?: string
  ): Promise<Expense> {
    return commandBus.execute<Expense>(
      new UpdateExpenseCommand(expenseId, rawData, tenantIdOf(scope), scope, userId)
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
    scope: WriteScope,
    userId?: string
  ): Promise<BulkImportResult> {
    return commandBus.execute<BulkImportResult>(
      new BulkImportExpensesCommand(records, tenantIdOf(scope), scope, userId)
    );
  }

  /** Standard-column enterprise import (date/vehicle/category/amount/jobTrip/description). */
  async importExpenses(
    rows: ImportExpenseRow[],
    scope: WriteScope,
    userId?: string
  ): Promise<ImportExpensesResult> {
    return commandBus.execute<ImportExpensesResult>(
      new ImportExpensesCommand(rows, tenantIdOf(scope), scope, userId)
    );
  }
}

export const expenseCommandService = new ExpenseCommandService();