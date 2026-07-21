// modules/expenses/commands/update-expense.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class UpdateExpenseCommand extends BaseCommand {
  static readonly commandName = 'UpdateExpenseCommand';

  constructor(
    public readonly expenseId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(UpdateExpenseCommand.commandName);
  }
}