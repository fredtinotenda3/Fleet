// modules/expenses/commands/handlers/update-expense.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { UpdateExpenseCommand } from '../update-expense.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { expenseUpdateSchema } from '@/shared/validations/expense.schema';
import { Expense } from '@/shared/types/expense.types';
import { NotFoundError, ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ExpenseUpdatedEvent } from '@/modules/expenses/events/ExpenseUpdatedEvent';

const ALLOWED_FIELDS = [
  'license_plate',
  'amount',
  'date',
  'expense_type_id',
  'description',
  'jobTrip',
  'notes',
] as const;

export class UpdateExpenseHandler
  implements ICommandHandler<UpdateExpenseCommand, Expense>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(command: UpdateExpenseCommand): Promise<Expense> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = { _id: command.expenseId };
    for (const field of ALLOWED_FIELDS) {
      if (raw[field] !== undefined) {
        clean[field] =
          field === 'amount' && typeof raw[field] === 'string'
            ? Number(raw[field])
            : raw[field];
      }
    }

    const result = await validateWithZod(expenseUpdateSchema, clean);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const { _id, ...updateData } = result.data as Record<string, unknown>;
    const db = await connectToDatabase();

    if (updateData.license_plate) {
      const vehicle = await db.collection('tblvehicles').findOne({
        license_plate: String(updateData.license_plate).toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicle) {
        throw new AppError(
          `Vehicle "${updateData.license_plate}" not found`,
          'VEHICLE_NOT_FOUND',
          400
        );
      }
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
    }

    if (updateData.expense_type_id) {
      if (!ObjectId.isValid(String(updateData.expense_type_id))) {
        throw new ValidationError('Invalid expense type ID');
      }
      const expenseType = await db.collection('tblexpense_types').findOne({
        _id: new ObjectId(String(updateData.expense_type_id)),
        isDeleted: { $ne: true },
      });
      if (!expenseType) {
        throw new AppError('Expense type not found', 'EXPENSE_TYPE_NOT_FOUND', 400);
      }
    }

    const updated = await this.expenseRepo.update(
      command.expenseId,
      updateData as Partial<Omit<Expense, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      command.tenantId,
      command.userId
    );

    if (!updated) {
      throw new NotFoundError('Expense not found');
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ExpenseUpdatedEvent(updated, updateData, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return updated;
  }
}