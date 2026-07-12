// modules/expenses/commands/handlers/bulk-import-expenses.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { BulkImportExpensesCommand } from '../bulk-import-expenses.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ValidationError } from '@/server/errors/app.errors';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

export interface BulkImportResult {
  inserted: number;
  errors: number;
  errorDetails: string[];
}

export class BulkImportExpensesHandler
  implements ICommandHandler<BulkImportExpensesCommand, BulkImportResult>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(command: BulkImportExpensesCommand): Promise<BulkImportResult> {
    if (!command.records || command.records.length === 0) {
      throw new ValidationError('No records to import');
    }

    const db = await connectToDatabase();
    const result: BulkImportResult = {
      inserted: 0,
      errors: 0,
      errorDetails: [],
    };

    for (const record of command.records) {
      try {
        // Find or create expense type
        let expenseTypeId: ObjectId | null = null;
        if (record.category) {
          const expenseType = await db.collection('tblexpense_types').findOne({
            name: { $regex: `^${record.category}$`, $options: 'i' },
          });

          if (!expenseType) {
            const insertResult = await db.collection('tblexpense_types').insertOne({
              name: record.category,
              category: record.category,
              isDeleted: false,
              createdAt: new Date(),
            });
            expenseTypeId = insertResult.insertedId;
          } else {
            expenseTypeId = expenseType._id as ObjectId;
          }
        }

        await this.expenseRepo.create(
          {
            license_plate: record.vehiclePlate || 'UNKNOWN',
            amount: record.totalAmount,
            date: new Date(record.date),
            // FIX (bulk-imported expenses always showed "Uncategorized"):
            // this previously stored `expenseTypeId.toString()` -- a plain
            // string -- on the expense document. tblexpense_types._id is a
            // native MongoDB ObjectId, and ExpenseRepository's
            // expenseTypeLookupStages() joins on
            // { localField: 'expense_type_id', foreignField: '_id' }.
            // MongoDB's $lookup requires exact BSON type equality, so a
            // string value NEVER matches an ObjectId value even when their
            // hex text is identical -- the join silently returned nothing
            // for every expense created through this import path, and
            // expenseCategoryLabel() then fell back to "Uncategorized"
            // even though a real category was matched/created above.
            // Storing the ObjectId itself (matching how
            // create-expense.handler.ts stores it, and how
            // ExpenseRepository.getFilteredExpenses's own type filter
            // already expects it: `new ObjectId(filters.type)`) makes the
            // join -- and category filtering -- work correctly.
            ...(expenseTypeId && { expense_type_id: expenseTypeId as unknown as string }),
            description: record.items.join(', '),
            notes: `Ref: ${record.reference} | Account: ${record.account} | Cost Centre: ${record.costCentre}`,
          },
          command.tenantId,
          command.userId
        );

        result.inserted++;
      } catch (err) {
        result.errors++;
        result.errorDetails.push(
          `Failed to import record: ${record.reference} - ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }

    return result;
  }
}