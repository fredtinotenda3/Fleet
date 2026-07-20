// modules/expenses/commands/handlers/import-expenses.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { ImportExpensesCommand } from '../import-expenses.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

export interface ImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  column?: string;
  invalidValue?: string;
  error?: string;
  suggestedFix?: string;
}

export interface ImportSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface ImportExpensesResult {
  summary: ImportSummary;
  results: ImportRowResult[];
}

function isValidDate(value: string): boolean {
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function parseAmount(value: string): number | null {
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export class ImportExpensesHandler
  implements ICommandHandler<ImportExpensesCommand, ImportExpensesResult>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(command: ImportExpensesCommand): Promise<ImportExpensesResult> {
    const db = await connectToDatabase();
    const results: ImportRowResult[] = [];

    // Cache vehicle and category lookups across rows to avoid N+1 queries.
    const vehicleCache = new Map<string, boolean>();
    const categoryCache = new Map<string, ObjectId>();

    for (const row of command.rows) {
      const rowNum = row.rowNumber;

      // --- Column-level validation ---
      if (!row.date || !isValidDate(row.date)) {
        results.push({
          row: rowNum,
          success: false,
          column: 'date',
          invalidValue: row.date,
          error: 'Date is missing or not a valid date',
          suggestedFix: 'Provide a date in YYYY-MM-DD format.',
        });
        continue;
      }

      const plate = (row.license_plate || '').trim().toUpperCase();
      if (!plate) {
        results.push({
          row: rowNum,
          success: false,
          column: 'vehicle',
          invalidValue: row.license_plate,
          error: 'Vehicle license plate is required',
          suggestedFix: 'Provide a valid vehicle license plate.',
        });
        continue;
      }

      const amount = parseAmount(row.amount);
      if (amount === null || amount <= 0) {
        results.push({
          row: rowNum,
          success: false,
          column: 'amount',
          invalidValue: row.amount,
          error: 'Amount is missing or not a valid positive number',
          suggestedFix: 'Provide a valid numeric amount, e.g. 125.50.',
        });
        continue;
      }

      // --- Vehicle existence (cached) ---
      let vehicleExists = vehicleCache.get(plate);
      if (vehicleExists === undefined) {
        const vehicle = await db.collection('tblvehicles').findOne({
          license_plate: plate,
          isDeleted: { $ne: true },
        });
        vehicleExists = Boolean(vehicle);
        vehicleCache.set(plate, vehicleExists);
      }
      if (!vehicleExists) {
        results.push({
          row: rowNum,
          success: false,
          column: 'vehicle',
          invalidValue: plate,
          error: `Vehicle "${plate}" was not found`,
          suggestedFix: 'Check the license plate matches an existing vehicle exactly.',
        });
        continue;
      }

      // --- Category resolution (cached, auto-create if new) ---
      let expenseTypeId: ObjectId | undefined;
      const categoryName = (row.category || '').trim();
      if (categoryName) {
        const cacheKey = categoryName.toLowerCase();
        let typeId = categoryCache.get(cacheKey);
        if (!typeId) {
          const existing = await db.collection('tblexpense_types').findOne({
            name: { $regex: `^${categoryName}$`, $options: 'i' },
            tenantId: command.tenantId,
            isDeleted: { $ne: true },
          });
          if (existing) {
            typeId = existing._id as ObjectId;
          } else {
            const inserted = await db.collection('tblexpense_types').insertOne({
              name: categoryName,
              category: categoryName,
              tenantId: command.tenantId,
              isDeleted: false,
              createdAt: new Date(),
            });
            typeId = inserted.insertedId;
          }
          categoryCache.set(cacheKey, typeId);
        }
        expenseTypeId = typeId;
      }

      // --- Duplicate detection: same vehicle + same calendar day + same amount, in this tenant ---
      const parsedDate = new Date(row.date);
      const dayStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const duplicate = await db.collection('tblexpenses').findOne({
        tenantId: command.tenantId,
        license_plate: plate,
        amount,
        date: { $gte: dayStart, $lt: dayEnd },
        isDeleted: { $ne: true },
      });

      if (duplicate) {
        results.push({
          row: rowNum,
          success: false,
          identifier: plate,
          error: `Duplicate of an existing expense for ${plate} on ${dayStart.toDateString()} for the same amount`,
          suggestedFix: 'Remove this row if it is a re-import, or adjust the amount/date if it is genuinely a separate expense.',
        });
        continue;
      }

      // --- Insert ---
      try {
        await this.expenseRepo.create(
          {
            license_plate: plate,
            amount,
            date: parsedDate,
            ...(expenseTypeId && { expense_type_id: expenseTypeId as unknown as string }),
            ...(row.description && { description: row.description.trim() }),
            ...(row.jobTrip && { jobTrip: row.jobTrip.trim() }),
          },
          command.tenantId,
          command.userId
        );
        results.push({ row: rowNum, success: true, identifier: plate });
      } catch (err) {
        results.push({
          row: rowNum,
          success: false,
          identifier: plate,
          error: err instanceof Error ? err.message : 'Unknown error while saving this row',
          suggestedFix: 'Check the row values and try again.',
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    return {
      summary: { total: results.length, succeeded, failed: results.length - succeeded },
      results,
    };
  }
}