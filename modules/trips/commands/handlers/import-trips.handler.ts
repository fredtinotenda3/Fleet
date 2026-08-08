// modules/trips/commands/handlers/import-trips.handler.ts
//
// Bulk trip import. Mirrors the shape of
// modules/expenses/commands/handlers/import-expenses.handler.ts (column
// validation -> lookups, cached per batch -> duplicate check -> insert,
// with a per-row result rather than an all-or-nothing transaction) and
// reuses driverRepository.findByNameOrCode(), the same free-text driver
// resolver the Fuel import already relies on.
//
// Org-unit scoping (the part specific to this handler): a trip's
// orgUnitId is inherited from its VEHICLE, exactly like
// CreateTripHandler -- not taken from the uploaded row, which is never
// trusted for tenancy-relevant fields. On top of that inheritance, when
// the caller has a narrowed TenantContext (context.accessibleOrgUnitIds
// !== null), any row whose vehicle resolves outside that caller's
// accessible org units is rejected as "Vehicle not found" -- the same
// fail-closed message used everywhere else in this codebase for an
// out-of-scope entity, so a scoped caller learns nothing about the
// existence of vehicles or trips outside their scope from the error
// text. If the resolved vehicle has no orgUnitId of its own (legacy
// data), the trip falls back to the caller's own activeOrgUnitId so it
// doesn't silently become invisible to everyone.

import { ICommandHandler } from '@/server/cqrs/command';
import { ImportTripsCommand } from '../import-trips.command';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { driverRepository } from '@/modules/drivers/repositories/driver.repository';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { Trip } from '@/shared/types/trip.types';
import type { Mode } from '@/shared/types/common.types';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { TripCreatedEvent } from '@/modules/trips/events/TripCreatedEvent';

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

export interface ImportTripsResult {
  summary: ImportSummary;
  results: ImportRowResult[];
}

const VALID_MODES: Mode[] = ['distance', 'odometer'];
const DEFAULT_UNIT_ID = 'km';

function isValidDate(value: string): boolean {
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function parseNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

interface VehicleLite {
  license_plate: string;
  orgUnitId?: string;
}

export class ImportTripsHandler
  implements ICommandHandler<ImportTripsCommand, ImportTripsResult>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(command: ImportTripsCommand): Promise<ImportTripsResult> {
    const db = await connectToDatabase();
    const results: ImportRowResult[] = [];
    const eventBus = EventBusFactory.getInstance();

    // Per-batch caches -- avoids one findOne() per row for repeated
    // plates/units, same rationale as ImportExpensesHandler.
    const vehicleCache = new Map<string, VehicleLite | null>();
    const unitCache = new Map<string, boolean>();
    const driverCache = new Map<string, { id: string } | null>();

    const context = command.context;
    const isScoped = !!context && context.accessibleOrgUnitIds !== null;

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
          column: 'license_plate',
          invalidValue: row.license_plate,
          error: 'Vehicle license plate is required',
          suggestedFix: 'Provide a valid vehicle license plate.',
        });
        continue;
      }

      const mode = ((row.mode || 'distance').toLowerCase().trim()) as Mode;
      if (!VALID_MODES.includes(mode)) {
        results.push({
          row: rowNum,
          success: false,
          column: 'mode',
          invalidValue: row.mode,
          error: `Mode must be one of: ${VALID_MODES.join(', ')}`,
          suggestedFix: 'Use "distance" (trip_distance column) or "odometer" (start_odometer/end_odometer columns).',
        });
        continue;
      }

      let distance_calculated = 0;
      const trip_distance = parseNumber(row.trip_distance);
      const start_odometer = parseNumber(row.start_odometer);
      const end_odometer = parseNumber(row.end_odometer);

      if (mode === 'distance') {
        if (trip_distance === null || trip_distance <= 0) {
          results.push({
            row: rowNum,
            success: false,
            column: 'trip_distance',
            invalidValue: String(row.trip_distance ?? ''),
            error: 'trip_distance is required and must be a positive number for distance-mode trips',
            suggestedFix: 'Provide a positive numeric distance, e.g. 120.',
          });
          continue;
        }
        distance_calculated = trip_distance;
      } else {
        if (start_odometer === null || end_odometer === null || end_odometer <= start_odometer) {
          results.push({
            row: rowNum,
            success: false,
            column: 'end_odometer',
            invalidValue: String(row.end_odometer ?? ''),
            error: 'start_odometer and end_odometer are required, and end_odometer must exceed start_odometer',
            suggestedFix: 'Check both odometer readings for this row.',
          });
          continue;
        }
        distance_calculated = end_odometer - start_odometer;
      }

      // --- Vehicle existence + scope check (cached) ---
      let vehicle = vehicleCache.get(plate);
      if (vehicle === undefined) {
        const found = await db.collection('tblvehicles').findOne({
          license_plate: plate,
          tenantId: command.tenantId,
          isDeleted: { $ne: true },
        });
        vehicle = found
          ? { license_plate: found.license_plate, orgUnitId: (found as { orgUnitId?: string }).orgUnitId }
          : null;
        vehicleCache.set(plate, vehicle);
      }
      if (!vehicle) {
        results.push({
          row: rowNum,
          success: false,
          column: 'license_plate',
          invalidValue: plate,
          error: `Vehicle "${plate}" was not found`,
          suggestedFix: 'Check the license plate matches an existing vehicle exactly.',
        });
        continue;
      }

      if (
        isScoped &&
        context &&
        !tenantScopeService.canAccessOrgUnit(context, vehicle.orgUnitId ?? '')
      ) {
        // Fail-closed, same message a nonexistent vehicle gets -- an
        // out-of-scope vehicle must not be distinguishable from a
        // missing one.
        results.push({
          row: rowNum,
          success: false,
          column: 'license_plate',
          invalidValue: plate,
          error: `Vehicle "${plate}" was not found`,
          suggestedFix: 'Check the license plate matches an existing vehicle exactly.',
        });
        continue;
      }

      // --- Unit existence (cached, distance-mode only) ---
      const unitId = (row.unit_id || DEFAULT_UNIT_ID).trim();
      let unitValid = unitCache.get(unitId);
      if (unitValid === undefined) {
        const unit = await db.collection('tblunits').findOne({ unit_id: unitId, type: 'distance' });
        unitValid = Boolean(unit);
        unitCache.set(unitId, unitValid);
      }
      if (!unitValid) {
        results.push({
          row: rowNum,
          success: false,
          column: 'unit_id',
          invalidValue: unitId,
          error: `Unit "${unitId}" was not found or is not a distance unit`,
          suggestedFix: `Leave blank to default to "${DEFAULT_UNIT_ID}", or use a valid distance unit code.`,
        });
        continue;
      }

      // --- Driver resolution (optional, cached) ---
      let driverId: string | undefined;
      const driverQuery = (row.driver || '').trim();
      if (driverQuery) {
        let resolved = driverCache.get(driverQuery.toLowerCase());
        if (resolved === undefined) {
          const driver = await driverRepository.findByNameOrCode(driverQuery, command.tenantId);
          resolved = driver ? { id: String(driver._id) } : null;
          driverCache.set(driverQuery.toLowerCase(), resolved);
        }
        if (!resolved) {
          results.push({
            row: rowNum,
            success: false,
            column: 'driver',
            invalidValue: driverQuery,
            error: `Driver "${driverQuery}" was not found, or the name/code matches more than one active driver`,
            suggestedFix: 'Use the exact driver_code, or leave this column blank.',
          });
          continue;
        }
        driverId = resolved.id;
      }

      // --- Duplicate detection: same plate + same calendar day + same
      // calculated distance, in this tenant. Mirrors CreateTripHandler's
      // write-time guard so a re-imported file is a no-op rather than a
      // pile of duplicate rows. ---
      const parsedDate = new Date(row.date);
      const dayStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const duplicate = await db.collection('tbltrips').findOne({
        tenantId: command.tenantId,
        license_plate: plate,
        distance_calculated,
        date: { $gte: dayStart, $lt: dayEnd },
        isDeleted: { $ne: true },
      });

      if (duplicate) {
        results.push({
          row: rowNum,
          success: false,
          identifier: plate,
          error: `Duplicate of an existing trip for ${plate} on ${dayStart.toDateString()} with the same distance`,
          suggestedFix: 'Remove this row if it is a re-import, or adjust the distance/date if it is genuinely a separate trip.',
        });
        continue;
      }

      // --- Insert ---
      try {
        const tripData: Omit<Trip, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'> = {
          tenantId: command.tenantId,
          license_plate: plate,
          mode,
          date: parsedDate,
          unit_id: unitId,
          distance_calculated,
          ...(vehicle.orgUnitId
            ? { orgUnitId: vehicle.orgUnitId }
            : context?.activeOrgUnitId
              ? { orgUnitId: context.activeOrgUnitId }
              : {}),
          ...(mode === 'distance' && trip_distance != null && { trip_distance }),
          ...(mode === 'odometer' && start_odometer != null && { start_odometer }),
          ...(mode === 'odometer' && end_odometer != null && { end_odometer }),
          ...(row.start_location && { start_location: row.start_location.trim() }),
          ...(row.end_location && { end_location: row.end_location.trim() }),
          ...(row.notes && { notes: row.notes.trim() }),
          ...(driverId && { driver_id: driverId }),
          status: 'completed',
          created_from: 'import',
        };

        const created = await this.tripRepo.create(tripData, command.tenantId, command.userId);

        await eventBus.publish(
          new TripCreatedEvent(created, {
            tenantId: command.tenantId,
            userId: command.userId,
            correlationId: ImportTripsCommand.commandName,
          })
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