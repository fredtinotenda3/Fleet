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
          let expenseType = await db.collection('tblexpense_types').findOne({
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
            tenantId: command.tenantId,
            license_plate: record.vehiclePlate || 'UNKNOWN',
            amount: record.totalAmount,
            date: new Date(record.date),
            ...(expenseTypeId && { expense_type_id: expenseTypeId.toString() }),
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