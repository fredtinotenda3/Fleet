// modules/expenses/commands/create-expense.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class CreateExpenseCommand extends BaseCommand {
  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(CreateExpenseCommand.name);
  }
}