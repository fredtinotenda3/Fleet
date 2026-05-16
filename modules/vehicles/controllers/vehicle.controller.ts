// C:\Users\user\Desktop\Fleet\modules\vehicles\controllers\vehicle.controller.ts

import { NextRequest } from 'next/server';
import { vehicleService } from '../services/vehicle.service';
import { VehicleFilters } from '@/shared/types/vehicle.types';
import { PaginationParams } from '@/shared/types/common.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest, isSuperAdmin } from '@/server/utils/context.utils';

export class VehicleController {
  async getVehicles(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const isAdmin = await isSuperAdmin(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: VehicleFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        make: searchParams.get('make') || undefined,
        model: searchParams.get('model') || undefined,
        status: searchParams.get('status') as any || undefined,
        year: searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined,
        vehicle_type: searchParams.get('vehicle_type') || undefined,
      };

      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '10');

      const pagination: PaginationParams = { page, limit };
      const result = await vehicleService.getFilteredVehicles(filters, pagination, tenantId);
      
      console.log(`✅ VehicleController.getVehicles returning: ${result.data.length} vehicles, total: ${result.pagination.total} (isAdmin: ${isAdmin})`);
      
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      console.error('❌ VehicleController error:', error);
      return this.handleError(error);
    }
  }

  async getVehicle(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const vehicle = await vehicleService.findById(id, tenantId);
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

      const vehicle = await vehicleService.findByLicensePlate(licensePlate, tenantId);
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
    
    console.log('Creating vehicle with data:', JSON.stringify(body, null, 2));
    
    const vehicle = await vehicleService.create(body, tenantId, userId);
    console.log('Vehicle created successfully:', vehicle);
    
    return createdResponse(vehicle);
  } catch (error) {
    console.error('Create vehicle error details:', error);
    return this.handleError(error);
  }
}

  async updateVehicle(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const vehicle = await vehicleService.update(id, body, tenantId, userId);
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

      await vehicleService.delete(id, tenantId, userId, soft);
      return successResponse({ message: 'Vehicle deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVehicleStats(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const isAdmin = await isSuperAdmin(req);
      const stats = await vehicleService.getVehicleStats(tenantId);
      console.log(`✅ Vehicle stats response: ${JSON.stringify(stats)} (isAdmin: ${isAdmin})`);
      return successResponse(stats);
    } catch (error) {
      console.error('❌ Vehicle stats error:', error);
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

      const result = await vehicleService.searchVehicles(searchTerm, { page, limit }, tenantId);
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

      const vehicles = await vehicleService.getVehiclesByStatus(status, tenantId);
      return successResponse(vehicles);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVehiclesDueForService(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const threshold = parseInt(req.nextUrl.searchParams.get('threshold') || '10000');

      const vehicles = await vehicleService.getVehiclesDueForService(threshold, tenantId);
      return successResponse(vehicles);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVehicleAnalytics(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const startDate = new Date(req.nextUrl.searchParams.get('startDate') || new Date().toISOString());
      const endDate = new Date(req.nextUrl.searchParams.get('endDate') || new Date().toISOString());

      const analytics = await vehicleService.getVehicleAnalytics(tenantId, startDate, endDate);
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

      const vehicle = await vehicleService.updateStatus(id, status, tenantId, userId);
      return successResponse(vehicle);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }
    console.error('Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}