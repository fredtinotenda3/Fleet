// modules/expenses/commands/bulk-import-expenses.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export interface BulkExpenseRecord {
  date: string | Date;
  reference: string;
  details: string;
  account: string;
  totalAmount: number;
  costCentre: string;
  items: string[];
  vehiclePlate?: string;
  category?: string;
}

export class BulkImportExpensesCommand extends BaseCommand {
  static readonly commandName = 'BulkImportExpensesCommand';

  constructor(
    public readonly records: BulkExpenseRecord[],
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(BulkImportExpensesCommand.commandName);
  }
}