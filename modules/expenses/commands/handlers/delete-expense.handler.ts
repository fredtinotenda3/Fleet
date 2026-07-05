// modules/expenses/commands/handlers/delete-expense.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { DeleteExpenseCommand } from '../delete-expense.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ExpenseDeletedEvent } from '@/modules/expenses/events/ExpenseDeletedEvent';

export class DeleteExpenseHandler
  implements ICommandHandler<DeleteExpenseCommand, void>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(command: DeleteExpenseCommand): Promise<void> {
    const existing = await this.expenseRepo.findById(
      command.expenseId,
      command.tenantId
    );
    if (!existing) {
      throw new NotFoundError('Expense not found');
    }

    if (command.soft) {
      await this.expenseRepo.softDelete(
        command.expenseId,
        command.tenantId,
        command.userId
      );
    } else {
      await this.expenseRepo.hardDelete(command.expenseId, command.tenantId);
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ExpenseDeletedEvent(
      command.expenseId,
      existing.license_plate,
      existing.amount,
      command.tenantId,
      {
        userId: command.userId,
        correlationId: command.commandName,
        soft: command.soft,
      }
    ));
  }
}