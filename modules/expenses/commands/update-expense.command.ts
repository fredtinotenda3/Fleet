// modules/expenses/commands/update-expense.command.ts

import { BaseCommand } from '@/server/cqrs/command';
import { WriteScope } from '@/server/tenancy/write-scope';

export class UpdateExpenseCommand extends BaseCommand {
  static readonly commandName = 'UpdateExpenseCommand';

  constructor(
    public readonly expenseId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    /** Authority this write runs under. See server/tenancy/write-scope.ts. */
    public readonly scope: WriteScope,
    public readonly userId?: string
  ) {
    super(UpdateExpenseCommand.commandName);
  }
}