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
        // FIX (critical -- cross-tenant data leak): the expense-type
        // lookup/create block below previously ran with NO tenantId
        // filter on the lookup, and NEVER set tenantId on the auto-
        // created document at all. That meant:
        //   1) A bulk import for Tenant A could match and silently
        //      reuse an expense type actually owned by Tenant B, purely
        //      because the category name matched case-insensitively.
        //   2) Any category auto-created via import had no tenant
        //      owner, so it was invisible to the importing tenant on
        //      every subsequent tenant-scoped read, while still being
        //      matchable (and reusable) by any other tenant's future
        //      import of the same category name.
        // Both the filter and the insert now scope to command.tenantId,
        // the same value used two lines below for expenseRepo.create().
        let expenseTypeId: ObjectId | null = null;
        if (record.category) {
          const expenseType = await db.collection('tblexpense_types').findOne({
            name: { $regex: `^${record.category}$`, $options: 'i' },
            tenantId: command.tenantId,
            isDeleted: { $ne: true },
          });

          if (!expenseType) {
            const insertResult = await db.collection('tblexpense_types').insertOne({
              name: record.category,
              category: record.category,
              tenantId: command.tenantId,
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
            // expense_type_id must be a real ObjectId (not a string) so
            // ExpenseRepository's $lookup join on tblexpense_types._id
            // resolves -- see create-expense.handler.ts for the same
            // rule and its history.
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