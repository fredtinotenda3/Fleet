//modules/expenses/commands/import-expenses.command.ts

// modules/expenses/commands/import-expenses.command.ts

import { BaseCommand } from '@/server/cqrs/command';

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
    public readonly userId?: string
  ) {
    super(ImportExpensesCommand.commandName);
  }
}