// modules/fuel/controllers/fuel.controller.ts

import { NextRequest } from 'next/server';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { fuelCommandService } from '../services/fuel-command.service';
import { fuelQueryService } from '../services/fuel-query.service';
import { FuelFilters } from '@/shared/types/fuel.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';
import { driverRepository } from '@/modules/drivers/repositories/driver.repository';

bootstrapCqrs();

/** Enterprise CSV import safety cap -- matches the client-side limit in ImportModal. */
const MAX_IMPORT_ROWS = 2000;

export interface ImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  error?: string;
}

export interface ImportResponse {
  summary: { total: number; succeeded: number; failed: number };
  results: ImportRowResult[];
}

export class FuelController {
  async getFuelLogs(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: FuelFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        unit_id: searchParams.get('unit_id') || undefined,
        payment_method: (searchParams.get('payment_method') as FuelFilters['payment_method']) || undefined,
        fuel_station_id: searchParams.get('fuel_station_id') || undefined,
        fuel_card_id: searchParams.get('fuel_card_id') || undefined,
        // NEW: filter fuel logs by driver
        driver_id: searchParams.get('driver_id') || undefined,
        startDate: searchParams.get('start')
          ? new Date(searchParams.get('start')!)
          : undefined,
        endDate: searchParams.get('end')
          ? new Date(searchParams.get('end')!)
          : undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        const result = await fuelQueryService.getFilteredLogs(
          filters,
          { page: 1, limit: 10000 },
          tenantId
        );
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(
        pageParam,
        searchParams.get('limit')
      );

      const result = await fuelQueryService.getFilteredLogs(
        filters,
        { page, limit },
        tenantId
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFuelLog(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const log = await fuelQueryService.getFuelLogById(id, tenantId);
      return successResponse(log);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createFuelLog(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const log = await fuelCommandService.createFuelLog(body, tenantId, userId);
      return createdResponse(log);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Enterprise CSV import. Accepts `{ records: Record<string, unknown>[] }`
   * (already parsed/coerced client-side by ImportModal) and creates one
   * fuel log per row through the exact same `fuelCommandService.createFuelLog`
   * path -- and therefore the exact same `fuelLogCreateSchema` validation,
   * vehicle/unit/station/card/driver lookups, and FuelLoggedEvent -- as the
   * single-log create flow. Rows are processed sequentially (not
   * Promise.all) so duplicate checks within the same batch are correctly
   * serialized. A row failure never aborts the batch; every row gets its
   * own success/failure result.
   *
   * NEW: rows may include a `driver` column (name, driver_code, or a raw
   * ObjectId string). It's resolved to a driver_id here -- BEFORE calling
   * fuelCommandService.createFuelLog -- so an unresolved driver produces a
   * clear, row-specific import error ("Driver 'J. Moyo' not found") rather
   * than a generic downstream validation failure. Rows with an empty/absent
   * `driver` cell import exactly as before (driver_id omitted).
   */
  async importFuelLogs(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      let body: { records?: unknown };
      try {
        body = await req.json();
      } catch {
        throw new ValidationError('Invalid JSON body');
      }

      const records = Array.isArray(body.records) ? (body.records as Record<string, unknown>[]) : null;
      if (!records || records.length === 0) {
        throw new ValidationError('No records provided for import');
      }
      if (records.length > MAX_IMPORT_ROWS) {
        throw new ValidationError(
          `Import exceeds the maximum of ${MAX_IMPORT_ROWS} rows per batch`
        );
      }

      const results: ImportRowResult[] = [];
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < records.length; i++) {
        const rawRow = { ...records[i] };
        const rowNumber = i + 2; // +1 for 0-index, +1 for the CSV header row
        const licensePlate =
          typeof rawRow.license_plate === 'string' ? rawRow.license_plate.toUpperCase() : undefined;

        try {
          // Resolve the `driver` cell (name/code/id) -> driver_id before
          // handing off to the shared create path. A non-empty cell that
          // fails to resolve fails the row with a specific message; an
          // empty/absent cell is simply omitted (unassigned), preserving
          // existing import behavior for files without a driver column.
          const driverCell = rawRow.driver;
          delete rawRow.driver;

          if (typeof driverCell === 'string' && driverCell.trim().length > 0) {
            const driver = await driverRepository.findByNameOrCode(driverCell, tenantId);
            if (!driver) {
              failed += 1;
              results.push({
                row: rowNumber,
                success: false,
                identifier: licensePlate,
                error: `Driver "${driverCell}" could not be matched to an active driver`,
              });
              continue;
            }
            rawRow.driver_id = driver._id;
          }

          const log = await fuelCommandService.createFuelLog(rawRow, tenantId, userId);
          succeeded += 1;
          results.push({
            row: rowNumber,
            success: true,
            identifier: `${log.license_plate} - ${new Date(log.date).toLocaleDateString()}`,
          });
        } catch (error) {
          failed += 1;
          const message =
            error instanceof AppError ? error.message : 'Unexpected error while importing this row';
          results.push({ row: rowNumber, success: false, identifier: licensePlate, error: message });
        }
      }

      const response: ImportResponse = {
        summary: { total: records.length, succeeded, failed },
        results,
      };
      return successResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateFuelLog(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const log = await fuelCommandService.updateFuelLog(id, body, tenantId, userId);
      return successResponse(log);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- unauthorized hard delete): same bug/fix as
   * VehicleController.deleteVehicle. `?soft=false` used to permanently
   * hardDelete() a fuel log under the same FUEL_DELETE permission as an
   * ordinary soft delete.
   */
  async deleteFuelLog(req: NextRequest, id: string) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';

      if (!soft && !authContext.isSuperAdmin) {
        throw new ForbiddenError(
          'Permanently deleting a fuel log requires organization owner or super admin access. Use a soft delete instead.'
        );
      }

      await fuelCommandService.deleteFuelLog(id, authContext.tenantId, authContext.userId, soft);
      return successResponse({ message: 'Fuel log deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFuelStats(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const dateRange =
        searchParams.get('startDate') && searchParams.get('endDate')
          ? {
              startDate: new Date(searchParams.get('startDate')!),
              endDate: new Date(searchParams.get('endDate')!),
            }
          : undefined;

      const stats = await fuelQueryService.getFuelStats(tenantId, dateRange);
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMonthlyConsumption(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const months = Number(req.nextUrl.searchParams.get('months') || '12');

      const data = await fuelQueryService.getMonthlyFuelConsumption(tenantId, months);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTopConsumers(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const limit = Number(req.nextUrl.searchParams.get('limit') || '5');

      const data = await fuelQueryService.getTopFuelConsumers(tenantId, limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * NEW: powers the "Fuel Consumption by Driver" dashboard chart. Backed
   * by a single grouped aggregation (FuelRepository.getFuelByDriver) --
   * no per-driver queries, scales with fleet size.
   */
  async getFuelByDriver(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const limit = Number(searchParams.get('limit') || '10');

      const dateRange =
        searchParams.get('startDate') && searchParams.get('endDate')
          ? {
              startDate: new Date(searchParams.get('startDate')!),
              endDate: new Date(searchParams.get('endDate')!),
            }
          : undefined;

      const data = await fuelQueryService.getFuelByDriver(tenantId, dateRange, limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFuelKpis(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const dateRange =
        searchParams.get('startDate') && searchParams.get('endDate')
          ? {
              startDate: new Date(searchParams.get('startDate')!),
              endDate: new Date(searchParams.get('endDate')!),
            }
          : undefined;

      const kpis = await fuelQueryService.getFuelKpis(tenantId, dateRange);
      return successResponse(kpis);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAbnormalConsumption(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const threshold = Number(req.nextUrl.searchParams.get('threshold') || '2');

      const data = await fuelQueryService.getAbnormalConsumption(tenantId, threshold);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[FuelController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const fuelController = new FuelController();