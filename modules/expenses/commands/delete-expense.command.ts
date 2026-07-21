// modules/expenses/commands/delete-expense.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class DeleteExpenseCommand extends BaseCommand {
  static readonly commandName = 'DeleteExpenseCommand';

  constructor(
    public readonly expenseId: string,
    public readonly tenantId: string,
    public readonly userId?: string,
    public readonly soft: boolean = true
  ) {
    super(DeleteExpenseCommand.commandName);
  }
}