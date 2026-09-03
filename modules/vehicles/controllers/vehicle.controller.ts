// modules/vehicles/controllers/vehicle.controller.ts

import { NextRequest } from 'next/server';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { vehicleCommandService } from '../services/vehicle-command.service';
import { vehicleQueryService } from '../services/vehicle-query.service';
import { VehicleFilters } from '@/shared/types/vehicle.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, isAppError, describeError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { vehicleRepository } from '../repositories/vehicle.repository';
import { driverRepository } from '@/modules/drivers/repositories/driver.repository';
import { exportService, fileDownloadResponse } from '@/shared/export';
import {
  VEHICLE_EXPORT_COLUMNS,
  VEHICLE_EXPORT_SHEET_NAME,
  VEHICLE_EXPORT_BASE_FILENAME,
} from '../export/vehicle-export.columns';
import { resolveTenantContext, resolveCreationOrgUnitId } from '@/server/utils/tenant-context.utils';

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

export class VehicleController {
  async getVehicles(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isPlatformAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;

      const filters: VehicleFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        make: searchParams.get('make') || undefined,
        model: searchParams.get('model') || undefined,
        status: (searchParams.get('status') as any) || undefined,
        year: searchParams.get('year')
          ? parseInt(searchParams.get('year')!)
          : undefined,
        vehicle_type: searchParams.get('vehicle_type') || undefined,
      };

      const { page, limit } = validatePaginationParams(
        searchParams.get('page'),
        searchParams.get('limit')
      );

      const result = await vehicleRepository.getFilteredVehiclesInScope(
        filters,
        { page, limit },
        tenantContext
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Phase 2 Enterprise Export Framework: exports the COMPLETE set of
   * vehicles matching the caller's current filters and authorization
   * scope, not just the page of results currently loaded in the UI
   * table. Reuses the exact same auth resolution, tenant-context
   * resolution, and filter parsing as getVehicles above so an export
   * can never see data the equivalent list call wouldn't -- the only
   * difference is getFilteredVehiclesForExport ignores pagination
   * (capped at EXPORT_ROW_CAP instead) and the response is a file
   * rather than JSON.
   */
  async exportVehicles(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isPlatformAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;

      const filters: VehicleFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        make: searchParams.get('make') || undefined,
        model: searchParams.get('model') || undefined,
        status: (searchParams.get('status') as any) || undefined,
        year: searchParams.get('year')
          ? parseInt(searchParams.get('year')!)
          : undefined,
        vehicle_type: searchParams.get('vehicle_type') || undefined,
      };

      const format = exportService.parseFormat(searchParams.get('format'));

      const { rows, totalMatched, truncated, exportCap } =
        await vehicleRepository.getFilteredVehiclesForExport(filters, tenantContext);

      const file = exportService.generate(
        rows,
        VEHICLE_EXPORT_COLUMNS,
        format,
        VEHICLE_EXPORT_BASE_FILENAME,
        VEHICLE_EXPORT_SHEET_NAME
      );

      return fileDownloadResponse(file, {
        totalMatched,
        rowsExported: rows.length,
        truncated,
        exportCap,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- org-unit scope bypass on single-record access):
   * every single-record endpoint below (getVehicle, updateVehicle,
   * deleteVehicle, updateVehicleStatus) previously checked ONLY
   * tenantId, never org-unit membership -- while getVehicles (the list
   * endpoint) is the only place in the entire app that applies
   * tenantContextService/tenantScopeService. A user scoped to a single
   * branch via UserScopeAssignment saw only their branch's vehicles in
   * the list, but could read/edit/delete ANY vehicle in the tenant by
   * ID, completely bypassing the org-unit boundary the Phase 7
   * infrastructure (UserScopeAssignment, TenantScopeService,
   * TenantScopedRepository) exists to enforce.
   *
   * This helper re-resolves the caller's TenantContext and verifies the
   * target vehicle's orgUnitId is one the caller may access before
   * returning the vehicle, and throws NotFoundError (not ForbiddenError)
   * on a scope violation -- returning 404 rather than 403 for
   * out-of-scope resources avoids leaking the existence of records in
   * branches the caller isn't supposed to know about.
   */
  private async loadInScopeVehicle(req: NextRequest, id: string) {
    const authContext = await getAuthContext(req);
    if (!authContext) {
      throw new UnauthorizedError('Authentication required');
    }

    const vehicle = await vehicleQueryService.getVehicleById(id, authContext.tenantId);

    const tenantContext = await tenantContextService.resolveContext(
      authContext.userId,
      authContext.tenantId,
      authContext.roles,
      authContext.isPlatformAdmin,
      authContext.orgUnitId
    );

    const vehicleOrgUnitId = (vehicle as any).orgUnitId as string | undefined;
    if (
      vehicleOrgUnitId &&
      !tenantScopeService.canAccessOrgUnit(tenantContext, vehicleOrgUnitId)
    ) {
      throw new NotFoundError('Vehicle not found');
    }

    // tenantContext is returned (not just used internally) so callers
    // that need a SECOND scope check against a different entity -- see
    // assignVehicleDriver()'s driver org-unit check below -- don't have
    // to re-resolve it via a second tenantContextService.resolveContext
    // call per request.
    return { authContext, vehicle, tenantContext };
  }

  async getVehicle(req: NextRequest, id: string) {
    try {
      const { vehicle } = await this.loadInScopeVehicle(req, id);
      return successResponse(vehicle);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVehicleByLicensePlate(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const licensePlate = req.nextUrl.searchParams.get('license_plate');

      if (!licensePlate) {
        throw new ValidationError('License plate is required');
      }

      const vehicle = await vehicleQueryService.getVehicleByLicensePlate(
        licensePlate,
        tenantId
      );
      return successResponse(vehicle);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createVehicle(req: NextRequest) {
    try {
      /**
       * Creation is scope-aware: a scoped user's new vehicle is filed
       * into their own org unit, so it is visible to them immediately.
       * Without this the row lands with no orgUnitId and the scoped read
       * filter hides it -- the user adds a vehicle and watches it vanish.
       */
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const orgUnitId = resolveCreationOrgUnitId(context, (body as any)?.orgUnitId);

      const vehicle = await vehicleCommandService.createVehicle(
        { ...(body as Record<string, unknown>), orgUnitId },
        context.organizationId,
        userId
      );
      return createdResponse(vehicle);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async importVehicles(req: NextRequest) {
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
        const rawRow = records[i];
        const rowNumber = i + 2;
        const licensePlate =
          typeof rawRow.license_plate === 'string' ? rawRow.license_plate.toUpperCase() : undefined;

        try {
          const vehicle = await vehicleCommandService.createVehicle(rawRow, tenantId, userId);
          succeeded += 1;
          results.push({ row: rowNumber, success: true, identifier: vehicle.license_plate });
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

  async updateVehicle(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeVehicle(req, id);
      const userId = authContext.userId;
      const body = await req.json();

      const vehicle = await vehicleCommandService.updateVehicle(
        id,
        body,
        authContext.tenantId,
        userId
      );
      return successResponse(vehicle);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- unauthorized hard delete): `?soft=false` used to be
   * enough to trigger a permanent, non-cascading hardDelete() with the
   * SAME permission required for an ordinary soft delete. Hard delete
   * now requires the caller to hold VEHICLE_DELETE *and* be
   * isSuperAdmin (SUPER_ADMIN or ORGANIZATION_OWNER) -- a regular
   * fleet_manager/dispatcher with delete rights can still soft-delete
   * (recoverable, and orphan-safe since soft-deleted vehicles are
   * simply excluded from active queries), but can no longer
   * permanently destroy a vehicle and orphan its expenses/fuel logs/
   * trips/reminders via a query string flag.
   */
  async deleteVehicle(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeVehicle(req, id);
      const userId = authContext.userId;
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';

      if (!soft && !authContext.isSuperAdmin) {
        throw new ForbiddenError(
          'Permanently deleting a vehicle requires organization owner or super admin access. Use a soft delete instead.'
        );
      }

      await vehicleCommandService.deleteVehicle(id, authContext.tenantId, userId, soft);
      return successResponse({ message: 'Vehicle deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVehicleStats(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const stats = await vehicleQueryService.getVehicleStats(
        context.organizationId,
        context
      );
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async searchVehicles(req: NextRequest) {
    try {
      const searchContext = await resolveTenantContext(req);
      const searchTerm = req.nextUrl.searchParams.get('q') || '';
      const { page, limit } = validatePaginationParams(
        req.nextUrl.searchParams.get('page'),
        req.nextUrl.searchParams.get('limit')
      );

      const result = await vehicleQueryService.searchVehicles(
        searchTerm,
        { page, limit },
        searchContext.organizationId,
        searchContext
      );
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVehiclesByStatus(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const status = req.nextUrl.searchParams.get('status');

      if (!status) {
        throw new ValidationError('Status parameter is required');
      }

      const vehicles = await vehicleQueryService.getVehiclesByStatus(
        status,
        tenantId
      );
      return successResponse(vehicles);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (high -- unvalidated numeric input): `parseInt(...)` on a
   * missing/garbage `threshold` param silently produced NaN, which
   * flows into a MongoDB `$gte`/`$expr` comparison and matches nothing
   * (or everything, depending on the operator) with no error surfaced
   * to the caller. Now validated and clamped to a sane range.
   */
  async getVehiclesDueForService(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const rawThreshold = req.nextUrl.searchParams.get('threshold');
      const parsed = rawThreshold ? parseInt(rawThreshold, 10) : 10000;
      if (rawThreshold && (Number.isNaN(parsed) || parsed < 0)) {
        throw new ValidationError('threshold must be a non-negative number');
      }
      const threshold = Number.isNaN(parsed) ? 10000 : Math.min(parsed, 1_000_000);

      const vehicles = await vehicleQueryService.getVehiclesDueForService(
        threshold,
        tenantId
      );
      return successResponse(vehicles);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (high -- unvalidated date input): `new Date(garbageString)`
   * produces `Invalid Date`, which MongoDB silently treats as excluding
   * everything from date-range filters rather than raising an error --
   * so a typo'd or malformed date param quietly returns an empty/wrong
   * analytics result instead of a clear 400.
   */
  async getVehicleAnalytics(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const startParam = req.nextUrl.searchParams.get('startDate');
      const endParam = req.nextUrl.searchParams.get('endDate');

      const startDate = startParam ? new Date(startParam) : new Date();
      const endDate = endParam ? new Date(endParam) : new Date();

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new ValidationError('startDate/endDate must be valid dates');
      }
      if (startDate > endDate) {
        throw new ValidationError('startDate must not be after endDate');
      }

      const analytics = await vehicleQueryService.getVehicleAnalytics(
        tenantId,
        startDate,
        endDate
      );
      return successResponse(analytics);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateVehicleStatus(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeVehicle(req, id);
      const userId = authContext.userId;
      const { status } = await req.json();

      const vehicle = await vehicleCommandService.updateVehicleStatus(
        id,
        status,
        authContext.tenantId,
        userId
      );
      return successResponse(vehicle);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * PATCH /api/vehicles/:id/driver -- assign, change, or clear the
   * vehicle's current driver. See
   * docs/DRIVER_VEHICLE_ASSIGNMENT_MISSING_BACKEND.md for the original
   * spec this implements.
   *
   * Scope enforcement mirrors updateVehicle/deleteVehicle/
   * updateVehicleStatus above: loadInScopeVehicle() already refuses a
   * vehicle outside the caller's tenant or org-unit scope (404, not
   * 403, to avoid leaking existence -- see that method's own comment).
   * This method adds the SAME check for the driver side of the
   * assignment: a caller scoped to one branch must not be able to
   * assign a driver who belongs to a different branch, even though
   * DriverRepository.findById alone would happily return them (it only
   * enforces tenant, not org unit). Reuses the tenantContext
   * loadInScopeVehicle already resolved rather than resolving it again.
   *
   * Permission is enforced entirely by the route
   * (app/api/vehicles/[id]/driver/route.ts -> withAuth(...,
   * { permission: Permission.DRIVER_ASSIGN })), same as every other
   * vehicle route -- nothing extra to check here.
   */
  async assignVehicleDriver(req: NextRequest, id: string) {
    try {
      const { authContext, tenantContext } = await this.loadInScopeVehicle(req, id);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        body = {};
      }
      const rawDriverId = (body as Record<string, unknown> | null)?.driverId;

      if (rawDriverId !== undefined && rawDriverId !== null && typeof rawDriverId !== 'string') {
        // Malformed payload shape (e.g. a number or object) is a client
        // error distinct from "driver not found" -- 400, not 404.
        throw new ValidationError('driverId must be a string or null');
      }

      const driverId =
        typeof rawDriverId === 'string' && rawDriverId.trim() ? rawDriverId.trim() : null;

      if (driverId) {
        // Tenant isolation: findById only ever returns a driver that
        // belongs to authContext.tenantId (and is not soft-deleted).
        // A well-formed but nonexistent/cross-tenant id is "not found",
        // not a validation error -- see the class comment on
        // AssignVehicleDriverCommand for why this same check is
        // repeated at the command-handler layer too.
        const driver = await driverRepository.findById(driverId, authContext.tenantId);
        if (!driver) {
          throw new NotFoundError('Driver not found');
        }

        const driverOrgUnitId = (driver as any).orgUnitId as string | undefined;
        if (
          driverOrgUnitId &&
          !tenantScopeService.canAccessOrgUnit(tenantContext, driverOrgUnitId)
        ) {
          // Same "404, not 403" reasoning as the vehicle scope check in
          // loadInScopeVehicle: don't confirm to a scoped caller that a
          // driver with this id exists in another branch.
          throw new NotFoundError('Driver not found');
        }
      }

      const vehicle = await vehicleCommandService.assignDriver(
        id,
        driverId,
        authContext.tenantId,
        authContext.userId
      );
      return successResponse(vehicle);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    // Structural guard, not `instanceof` -- see isAppError() for why the
    // identity check silently converted domain errors into 500s.
    if (isAppError(error)) {
      return errorResponse(
        error.message,
        error.code,
        error.statusCode,
        error.details
      );
    }
    // Flat object so the platform log prints the whole message and
    // stack rather than truncating at the constructor name.
    console.error('[VehicleController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const vehicleController = new VehicleController();