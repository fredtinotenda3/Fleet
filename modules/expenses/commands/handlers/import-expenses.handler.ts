// modules/expenses/commands/handlers/import-expenses.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { ImportExpensesCommand } from '../import-expenses.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { AppError } from '@/server/errors/app.errors';
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';

/**
 * Per-import memo of plate -> resolution. Holds the org unit on success
 * and the refusal message on failure, so a spreadsheet with many rows
 * for one plate does a single scoped lookup either way.
 */
type ResolvedImportVehicle = { orgUnitId?: string } | { error: string };

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
    const vehicleCache = new Map<string, ResolvedImportVehicle>();
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

      /**
       * --- Vehicle resolution (cached) ---
       *
       * TWO FIXES HERE.
       *
       * 1. SCOPE. This was an existence check against an unscoped
       *    query, so an import could reference any tenant's vehicle.
       *    It now resolves through vehicleWriteResolver under the
       *    importer's own scope.
       * 2. ORG UNIT. Even on success the resolved vehicle was
       *    discarded and the row inserted below carried NO orgUnitId
       *    at all -- so every expense that has ever been imported by
       *    spreadsheet is invisible to every scope-narrowed user, in a
       *    module whose interactive create path stamps the field
       *    correctly. The cache now holds the org unit, not a boolean.
       *
       * The cache stores the failure too (as null), so a spreadsheet
       * with 300 rows for one out-of-scope plate does one lookup, not
       * 300.
       */
      let resolved = vehicleCache.get(plate);
      if (resolved === undefined) {
        try {
          const vehicle = await vehicleWriteResolver.resolveForWrite(plate, command.scope);
          resolved = { orgUnitId: vehicleWriteResolver.orgUnitIdFor(vehicle) };
        } catch (err) {
          resolved = {
            error: err instanceof AppError ? err.message : `Vehicle "${plate}" was not found`,
          };
        }
        vehicleCache.set(plate, resolved);
      }
      if ('error' in resolved) {
        results.push({
          row: rowNum,
          success: false,
          column: 'vehicle',
          invalidValue: plate,
          error: resolved.error,
          suggestedFix: 'Check the license plate matches a vehicle you have access to.',
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
            ...(resolved.orgUnitId && { orgUnitId: resolved.orgUnitId }),
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