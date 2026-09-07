//modules/expenses/commands/import-expenses.command.ts

// modules/expenses/commands/import-expenses.command.ts

import { BaseCommand } from '@/server/cqrs/command';
import { WriteScope } from '@/server/tenancy/write-scope';

export interface ImportExpenseRow {
  rowNumber: number;
  date: string;
  license_plate: string;
  category?: string;
  amount: string;
  jobTrip?: string;
  description?: string;
}

export class ImportExpensesCommand extends BaseCommand {
  static readonly commandName = 'ImportExpensesCommand';

  constructor(
    public readonly rows: ImportExpenseRow[],
    public readonly tenantId: string,
    /** Authority this write runs under. See server/tenancy/write-scope.ts. */
    public readonly scope: WriteScope,
    public readonly userId?: string
  ) {
    super(ImportExpensesCommand.commandName);
  }
}