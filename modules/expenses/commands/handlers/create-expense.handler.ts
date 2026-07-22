// modules/expenses/commands/handlers/create-expense.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { CreateExpenseCommand } from '../create-expense.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { expenseCreateSchema } from '@/shared/validations/expense.schema';
import { Expense } from '@/shared/types/expense.types';
import { ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ExpenseCreatedEvent } from '@/modules/expenses/events/ExpenseCreatedEvent';

export class CreateExpenseHandler
  implements ICommandHandler<CreateExpenseCommand, Expense>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(command: CreateExpenseCommand): Promise<Expense> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = {
      license_plate: raw.license_plate,
      amount: typeof raw.amount === 'string' ? Number(raw.amount) : raw.amount,
      date: raw.date,
      expense_type_id: raw.expense_type_id || undefined,
      description: raw.description,
      jobTrip: raw.jobTrip,
      notes: raw.notes,
    };

    const payload = Object.fromEntries(
      Object.entries(clean).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    const result = await validateWithZod(expenseCreateSchema, payload);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const validated = result.data;

    const db = await connectToDatabase();
    const vehicle = await db.collection('tblvehicles').findOne({
      license_plate: String(validated.license_plate).toUpperCase(),
      isDeleted: { $ne: true },
      ...(command.tenantId !== 'default' && command.tenantId !== 'system'
        ? { tenantId: command.tenantId }
        : {}),
    });

    if (!vehicle) {
      throw new AppError(
        `Vehicle "${validated.license_plate}" not found`,
        'VEHICLE_NOT_FOUND',
        400
      );
    }

    let expenseTypeId: ObjectId | undefined;
    if (validated.expense_type_id) {
      if (!ObjectId.isValid(String(validated.expense_type_id))) {
        throw new ValidationError('Invalid expense type ID');
      }
      const expenseType = await db.collection('tblexpense_types').findOne({
        _id: new ObjectId(String(validated.expense_type_id)),
        isDeleted: { $ne: true },
      });
      if (!expenseType) {
        throw new AppError('Expense type not found', 'EXPENSE_TYPE_NOT_FOUND', 400);
      }
      expenseTypeId = new ObjectId(String(validated.expense_type_id));
    }

    /**
     * FIX (category always displays as "Uncategorized" for new
     * expenses): this previously stored `expenseTypeId.toString()` --
     * a plain string -- on the expense document. tblexpense_types._id
     * is a native MongoDB ObjectId, and ExpenseRepository's
     * expenseTypeLookupStages() joins on
     * { localField: 'expense_type_id', foreignField: '_id' }.
     * MongoDB's $lookup requires exact BSON type equality, so a string
     * value NEVER matches an ObjectId value even when their hex text is
     * identical -- the join silently returned nothing for every expense
     * created through this handler, and expenseCategoryLabel() then
     * correctly (but misleadingly) fell back to "Uncategorized" even
     * though a real category had been selected and validated above.
     * Storing the ObjectId itself (matching how
     * scripts/seed-actual-expenses-from-file.ts has always stored it,
     * and how ExpenseRepository.getFilteredExpenses's own type filter
     * already expects it: `new ObjectId(filters.type)`) makes the join
     * -- and category filtering -- work correctly for every new expense.
     * See scripts/fix-expense-type-id-types.ts for a one-off migration
     * that repairs existing string-typed records created before this
     * fix.
     */
    // FIX: `tenantId` removed from this object. ExpenseRepository.create()
    // takes tenantId as its own (second) argument and sets it internally --
    // its data-parameter type is
    // Omit<Expense, '_id' | 'isDeleted' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'tenantId'>.
    // The Omit<> annotation below previously didn't exclude 'tenantId', so this
    // object carried a redundant (and, once assigned into a literal call site,
    // TS-rejected -- see bulk-import-expenses.handler.ts) tenantId field. It
    // only compiled here because expenseData is a separately-typed variable,
    // which skips TypeScript's excess-property check; the actual tenantId
    // used for the write was always the `command.tenantId` argument below,
    // never this one.
    const expenseData: Omit<
      Expense,
      '_id' | 'isDeleted' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'tenantId'
    > = {
      license_plate: String(validated.license_plate).toUpperCase(),
      amount: Number(validated.amount),
      date: new Date(validated.date as unknown as string),
      ...((vehicle as { orgUnitId?: string }).orgUnitId && {
        orgUnitId: (vehicle as { orgUnitId?: string }).orgUnitId,
      }),
      ...(expenseTypeId && { expense_type_id: expenseTypeId as unknown as string }),
      ...(validated.description && { description: String(validated.description).trim() }),
      ...(validated.jobTrip && { jobTrip: String(validated.jobTrip).trim() }),
      ...(validated.notes && { notes: String(validated.notes).trim() }),
    };

    const created = await this.expenseRepo.create(expenseData, command.tenantId, command.userId);

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ExpenseCreatedEvent(created, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return created;
  }
}