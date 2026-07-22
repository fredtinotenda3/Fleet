// modules/fuel/controllers/fuel.controller.ts

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { fuelCommandService } from '../services/fuel-command.service';
import { fuelQueryService } from '../services/fuel-query.service';
import { FuelFilters } from '@/shared/types/fuel.types';
import type { FuelByDriverSort } from '../queries/get-fuel-by-driver.query';
import type { FuelTrendGranularity } from '@/shared/types/fuel.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';
import { driverRepository } from '@/modules/drivers/repositories/driver.repository';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { fuelRepository } from '../repositories/fuel.repository';

bootstrapCqrs();

const MAX_IMPORT_ROWS = 2000;
const VALID_GRANULARITIES: FuelTrendGranularity[] = ['week', 'month', 'quarter', 'year'];

export interface ImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  error?: string;
  /** True when this row was skipped because it duplicates an existing
   *  fuel log or another row earlier in the same file. Always false
   *  when `success` is true. */
  duplicate?: boolean;
}

export interface ImportResponse {
  summary: { total: number; succeeded: number; duplicates: number; failed: number };
  results: ImportRowResult[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Shared helper: parses the optional startDate/endDate query params used by every analytics action. */
function parseDateRange(searchParams: URLSearchParams): { startDate?: Date; endDate?: Date } | undefined {
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  if (!startDate && !endDate) return undefined;
  return {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  };
}

/**
 * FIX (ðŸŸ  perf / timeout root cause): the import loop used to call
 * driverRepository.findByNameOrCode(...) and a one-off fuel-station regex
 * query PER ROW. Resolving both ONCE before the loop into in-memory maps
 * removes ~2 DB round trips Ã— row count.
 */
interface DriverLookupEntry {
  id: string;
}

async function buildDriverLookup(tenantId: string): Promise<{
  byKey: Map<string, DriverLookupEntry>;
  ambiguousKeys: Set<string>;
  byId: Map<string, DriverLookupEntry>;
}> {
  const drivers = await driverRepository.findAll(tenantId);
  const byKey = new Map<string, DriverLookupEntry>();
  const ambiguousKeys = new Set<string>();
  const byId = new Map<string, DriverLookupEntry>();

  for (const d of drivers) {
    const id = String(d._id);
    byId.set(id, { id });

    const keys = [d.name, (d as { driver_code?: string }).driver_code]
      .filter((k): k is string => Boolean(k && k.trim()))
      .map((k) => k.trim().toLowerCase());

    for (const key of keys) {
      const existing = byKey.get(key);
      if (existing && existing.id !== id) {
        ambiguousKeys.add(key);
      } else {
        byKey.set(key, { id });
      }
    }
  }

  return { byKey, ambiguousKeys, byId };
}

async function buildStationLookup(tenantId: string): Promise<Map<string, string>> {
  const db = await connectToDatabase();
  const stations = await db
    .collection('tblfuelstations')
    .find(
      { tenantId, isDeleted: { $ne: true } },
      { projection: { name: 1, brand: 1 } }
    )
    .toArray();

  const map = new Map<string, string>();
  for (const s of stations) {
    const id = String(s._id);
    if (s.name) map.set(String(s.name).trim().toLowerCase(), id);
    if (s.brand) map.set(String(s.brand).trim().toLowerCase(), id);
  }
  return map;
}

// ---------------------------------------------------------------------
// NEW: duplicate detection for bulk fuel-log imports.
//
// A "duplicate" is defined as the SAME vehicle + SAME calendar day +
// SAME fuel volume + SAME cost -- matching the exact criteria the
// person's own upstream data-cleaning tooling already used for
// cross-sheet dedup (see their Transformation Log: "Exact duplicate of
// a transaction already present on an earlier sheet (same plate/date/
// volume/cost/driver/fuel type)"). We intentionally key on
// plate+date+volume+cost only (not driver/fuel_type) so this also
// catches duplicates against records already sitting in the database
// from a prior manual entry or an earlier import run, where those extra
// fields may not always be populated consistently.
// ---------------------------------------------------------------------

function normalizeDedupDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10); // calendar day only
}

function normalizeDedupNumber(value: unknown): string {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof n !== 'number' || Number.isNaN(n)) return String(value ?? '');
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Returns null if there isn't enough data on the row to form a reliable key (missing plate). */
function buildFuelDedupKey(row: {
  license_plate?: unknown;
  date?: unknown;
  fuel_volume?: unknown;
  cost?: unknown;
}): string | null {
  const plate = typeof row.license_plate === 'string' ? row.license_plate.trim().toUpperCase() : '';
  if (!plate) return null;
  return [plate, normalizeDedupDate(row.date), normalizeDedupNumber(row.fuel_volume), normalizeDedupNumber(row.cost)].join('|');
}

/**
 * Pre-fetches every existing (non-deleted) fuel log for the vehicles
 * touched by this batch, scoped to the batch's own date range, and
 * reduces them to a Set of dedup keys. One query for the whole import
 * instead of one per row.
 */
async function buildExistingFuelLogKeys(
  tenantId: string,
  plates: string[],
  dateRange: { min: Date; max: Date } | null
): Promise<Set<string>> {
  if (plates.length === 0) return new Set();

  const db = await connectToDatabase();
  const match: Record<string, unknown> = {
    tenantId,
    isDeleted: { $ne: true },
    license_plate: { $in: plates },
  };
  if (dateRange) {
    // Small buffer on either side to be safe against timezone-boundary rounding.
    const bufferedMin = new Date(dateRange.min.getTime() - 24 * 60 * 60 * 1000);
    const bufferedMax = new Date(dateRange.max.getTime() + 24 * 60 * 60 * 1000);
    match.date = { $gte: bufferedMin, $lte: bufferedMax };
  }

  const existing = await db
    .collection('tblfuellogs')
    .find(match, { projection: { license_plate: 1, date: 1, fuel_volume: 1, cost: 1 } })
    .toArray();

  const keys = new Set<string>();
  for (const log of existing) {
    const key = buildFuelDedupKey({
      license_plate: log.license_plate,
      date: log.date,
      fuel_volume: log.fuel_volume,
      cost: log.cost,
    });
    if (key) keys.add(key);
  }
  return keys;
}

export class FuelController {
  async getFuelLogs(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isSuperAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;

      const filters: FuelFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        unit_id: searchParams.get('unit_id') || undefined,
        payment_method: (searchParams.get('payment_method') as FuelFilters['payment_method']) || undefined,
        fuel_station_id: searchParams.get('fuel_station_id') || undefined,
        fuel_card_id: searchParams.get('fuel_card_id') || undefined,
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
        const result = await fuelRepository.getFilteredLogsInScope(
          filters,
          tenantContext,
          { page: 1, limit: 10000 }
        );
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(
        pageParam,
        searchParams.get('limit')
      );

      const result = await fuelRepository.getFilteredLogsInScope(
        filters,
        tenantContext,
        { page, limit }
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- org-unit scope bypass on single-record access):
   * same bug/fix as VehicleController.loadInScopeVehicle -- getFuelLogs
   * (list) was the only endpoint applying org-unit scoping;
   * getFuelLog/updateFuelLog/deleteFuelLog checked only tenantId.
   */
  private async loadInScopeFuelLog(req: NextRequest, id: string) {
    const authContext = await getAuthContext(req);
    if (!authContext) {
      throw new UnauthorizedError('Authentication required');
    }

    const log = await fuelQueryService.getFuelLogById(id, authContext.tenantId);

    const tenantContext = await tenantContextService.resolveContext(
      authContext.userId,
      authContext.tenantId,
      authContext.roles,
      authContext.isSuperAdmin,
      authContext.orgUnitId
    );

    const logOrgUnitId = (log as any).orgUnitId as string | undefined;
    if (
      logOrgUnitId &&
      !tenantScopeService.canAccessOrgUnit(tenantContext, logOrgUnitId)
    ) {
      throw new NotFoundError('Fuel log not found');
    }

    return { authContext, log };
  }

  async getFuelLog(req: NextRequest, id: string) {
    try {
      const { log } = await this.loadInScopeFuelLog(req, id);
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

      // Batch-resolve drivers + stations ONCE for the whole import.
      const [{ byKey: driverByKey, ambiguousKeys: ambiguousDriverKeys, byId: driverById }, stationLookup] =
        await Promise.all([buildDriverLookup(tenantId), buildStationLookup(tenantId)]);

      // NEW: pre-fetch existing fuel logs for the vehicles in this batch so
      // we can detect duplicates against data already in the database,
      // without querying per row.
      const distinctPlates = Array.from(
        new Set(
          records
            .map((r) => (typeof r.license_plate === 'string' ? r.license_plate.trim().toUpperCase() : ''))
            .filter(Boolean)
        )
      );

      let batchDateRange: { min: Date; max: Date } | null = null;
      for (const r of records) {
        if (!r.date) continue;
        const d = new Date(r.date as string | number);
        if (Number.isNaN(d.getTime())) continue;
        if (!batchDateRange) {
          batchDateRange = { min: d, max: d };
        } else {
          if (d < batchDateRange.min) batchDateRange.min = d;
          if (d > batchDateRange.max) batchDateRange.max = d;
        }
      }

      const existingKeys = await buildExistingFuelLogKeys(tenantId, distinctPlates, batchDateRange);
      // Tracks keys created earlier in THIS SAME batch, to catch
      // duplicates within the file itself (e.g. the same transaction
      // appearing on two source sheets, or the file being uploaded twice
      // in one go).
      const seenInBatch = new Set<string>();

      const results: ImportRowResult[] = [];
      let succeeded = 0;
      let duplicates = 0;
      let failed = 0;

      for (let i = 0; i < records.length; i++) {
        const rawRow = { ...records[i] };
        const rowNumber = i + 2;
        const licensePlate =
          typeof rawRow.license_plate === 'string' ? rawRow.license_plate.toUpperCase() : undefined;

        try {
          // --- Duplicate check happens before any DB write for this row ---
          const dedupKey = buildFuelDedupKey(rawRow);
          if (dedupKey && (existingKeys.has(dedupKey) || seenInBatch.has(dedupKey))) {
            duplicates += 1;
            results.push({
              row: rowNumber,
              success: false,
              duplicate: true,
              identifier: licensePlate,
              error: 'Skipped -- duplicate of an existing fuel log or another row in this file (same plate, date, volume, and cost)',
            });
            continue;
          }

          const driverCell = rawRow.driver;
          delete rawRow.driver;

          if (typeof driverCell === 'string' && driverCell.trim().length > 0) {
            const trimmed = driverCell.trim();

            if (ObjectId.isValid(trimmed) && driverById.has(trimmed)) {
              rawRow.driver_id = trimmed;
            } else {
              const key = trimmed.toLowerCase();
              if (ambiguousDriverKeys.has(key)) {
                failed += 1;
                results.push({
                  row: rowNumber,
                  success: false,
                  identifier: licensePlate,
                  error: `Driver "${driverCell}" matches more than one active driver -- use a driver ID instead`,
                });
                continue;
              }
              const match = driverByKey.get(key);
              if (!match) {
                failed += 1;
                results.push({
                  row: rowNumber,
                  success: false,
                  identifier: licensePlate,
                  error: `Driver "${driverCell}" could not be matched to an active driver`,
                });
                continue;
              }
              rawRow.driver_id = match.id;
            }
          }

          if (
            !rawRow.fuel_station_id &&
            typeof rawRow.station_name === 'string' &&
            rawRow.station_name.trim().length > 0
          ) {
            const resolvedStationId = stationLookup.get(rawRow.station_name.trim().toLowerCase());
            if (resolvedStationId) {
              rawRow.fuel_station_id = resolvedStationId;
            }
          }

          const log = await fuelCommandService.createFuelLog(rawRow, tenantId, userId);
          succeeded += 1;
          if (dedupKey) seenInBatch.add(dedupKey);
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
        summary: { total: records.length, succeeded, duplicates, failed },
        results,
      };
      return successResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateFuelLog(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeFuelLog(req, id);
      const userId = authContext.userId;
      const body = await req.json();

      const log = await fuelCommandService.updateFuelLog(id, body, authContext.tenantId, userId);
      return successResponse(log);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteFuelLog(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeFuelLog(req, id);
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
      const dateRange = parseDateRange(req.nextUrl.searchParams);
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

  async getFuelByDriver(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const limit = Number(searchParams.get('limit') || '10');
      const sortBy = (searchParams.get('sortBy') as FuelByDriverSort) || 'volume';
      const dateRange = parseDateRange(searchParams);

      const data = await fuelQueryService.getFuelByDriver(tenantId, dateRange, limit, sortBy);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFuelKpis(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = parseDateRange(req.nextUrl.searchParams);
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

  // ---- Enterprise analytics ----

  /** #1 Vehicle Fuel Activity Timeline */
  async getVehicleFuelTimeline(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const dateRange = parseDateRange(searchParams);
      const licensePlate = searchParams.get('license_plate') || undefined;

      const data = await fuelQueryService.getVehicleFuelTimeline(tenantId, {
        license_plate: licensePlate,
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate,
      });
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #4 Fuel Spend by Station + #8 Top Fuel Stations (same data, sorted client-side) */
  async getFuelByStation(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const limit = Number(searchParams.get('limit') || '15');
      const dateRange = parseDateRange(searchParams);

      const data = await fuelQueryService.getFuelByStation(tenantId, dateRange, limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #3 Fuel Activity Trend */
  async getFuelActivityTrend(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const granularityParam = searchParams.get('granularity') as FuelTrendGranularity | null;
      const granularity: FuelTrendGranularity =
        granularityParam && VALID_GRANULARITIES.includes(granularityParam) ? granularityParam : 'month';
      const dateRange = parseDateRange(searchParams);

      const data = await fuelQueryService.getFuelActivityTrend(tenantId, granularity, dateRange);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #5 Average Fuel Price Trend */
  async getAverageFuelPriceTrend(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const granularityParam = searchParams.get('granularity') as FuelTrendGranularity | null;
      const granularity: FuelTrendGranularity =
        granularityParam && VALID_GRANULARITIES.includes(granularityParam) ? granularityParam : 'month';
      const dateRange = parseDateRange(searchParams);

      const data = await fuelQueryService.getAverageFuelPriceTrend(tenantId, dateRange, granularity);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #6 Fuel Type Distribution */
  async getFuelTypeDistribution(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = parseDateRange(req.nextUrl.searchParams);
      const data = await fuelQueryService.getFuelTypeDistribution(tenantId, dateRange);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #7 Fueling Frequency by Vehicle */
  async getFuelingFrequencyByVehicle(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const limit = Number(searchParams.get('limit') || '20');
      const dateRange = parseDateRange(searchParams);

      const data = await fuelQueryService.getFuelingFrequencyByVehicle(tenantId, dateRange, limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #9 Fuel Cost Distribution */
  async getFuelCostDistribution(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = parseDateRange(req.nextUrl.searchParams);
      const data = await fuelQueryService.getFuelCostDistribution(tenantId, dateRange);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #10 Fuel Entry Heatmap */
  async getFuelEntryHeatmap(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = parseDateRange(req.nextUrl.searchParams);
      const data = await fuelQueryService.getFuelEntryHeatmap(tenantId, dateRange);
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