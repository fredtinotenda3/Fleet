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
import { AppError, ValidationError, UnauthorizedError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { vehicleRepository } from '../repositories/vehicle.repository';


// Ensure CQRS handlers are registered before any controller method runs.
// Calling this at module-evaluation time (rather than inside each method)
// keeps the cost of the idempotency check to once per process, not once
// per request.
bootstrapCqrs();

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
        authContext.isSuperAdmin,
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

  async getVehicle(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const vehicle = await vehicleQueryService.getVehicleById(id, tenantId);
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
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const vehicle = await vehicleCommandService.createVehicle(
        body,
        tenantId,
        userId
      );
      return createdResponse(vehicle);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateVehicle(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const vehicle = await vehicleCommandService.updateVehicle(
        id,
        body,
        tenantId,
        userId
      );
      return successResponse(vehicle);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteVehicle(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';

      await vehicleCommandService.deleteVehicle(id, tenantId, userId, soft);
      return successResponse({ message: 'Vehicle deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVehicleStats(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const stats = await vehicleQueryService.getVehicleStats(tenantId);
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async searchVehicles(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchTerm = req.nextUrl.searchParams.get('q') || '';
      const { page, limit } = validatePaginationParams(
        req.nextUrl.searchParams.get('page'),
        req.nextUrl.searchParams.get('limit')
      );

      const result = await vehicleQueryService.searchVehicles(
        searchTerm,
        { page, limit },
        tenantId
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

  async getVehiclesDueForService(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const threshold = parseInt(
        req.nextUrl.searchParams.get('threshold') || '10000'
      );

      const vehicles = await vehicleQueryService.getVehiclesDueForService(
        threshold,
        tenantId
      );
      return successResponse(vehicles);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVehicleAnalytics(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const startDate = new Date(
        req.nextUrl.searchParams.get('startDate') || new Date().toISOString()
      );
      const endDate = new Date(
        req.nextUrl.searchParams.get('endDate') || new Date().toISOString()
      );

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
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { status } = await req.json();

      const vehicle = await vehicleCommandService.updateVehicleStatus(
        id,
        status,
        tenantId,
        userId
      );
      return successResponse(vehicle);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(
        error.message,
        error.code,
        error.statusCode,
        error.details
      );
    }
    console.error('[VehicleController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const vehicleController = new VehicleController();